import type { CamMeta } from '../camStore'

/**
 * Transport layer for talking to upstream cameras: raw TCP sockets for
 * plaintext HTTP (Workers' `fetch()` is unreliable for direct-IP origins),
 * `fetch()` for HTTPS, with bounded bodies, manual redirect chasing and
 * once-per-failure-mode diagnostics.
 */

// Dedup sets for one-shot diagnostics. Reset (rather than grow unbounded)
// once they get large — re-logging a failure mode after a reset is harmless.
const MAX_LOGGED_KEYS = 1000
export function rememberLogKey(set: Set<string>, key: string): boolean {
  if (set.has(key)) return false
  if (set.size >= MAX_LOGGED_KEYS) set.clear()
  set.add(key)
  return true
}

// Ports where we'd expect TLS rather than cleartext HTTP. The probe rewrites
// the scheme to https:// for these so a camera whose admin panel is HTTPS-only
// isn't dismissed as unreachable.
const TLS_PORTS = new Set<number>([443, 8443])

export function probeBase(cam: CamMeta): string {
  const scheme = TLS_PORTS.has(cam.port) ? 'https' : 'http'
  return `${scheme}://${cam.ip}:${cam.port}`
}

// Counter of distinct fetch-error messages per cam-base so we log each unique
// failure mode once instead of spamming the tail with the same error every
// 2s. Keyed by `${base}|${msg}` so e.g. a port-restriction error from
// http://1.2.3.4:82 logs separately from the same error against :84.
const loggedFetchErrors = new Set<string>()

export interface HttpReply {
  status: number
  contentType: string
  body: Uint8Array
  bodyTooLarge?: boolean
  // Raw `Location` header for 3xx replies. `fetch()` follows redirects on its
  // own, but the raw-socket path does not, so we surface it for httpGet to
  // chase manually — a cam that 301s a snapshot path (often to https://) would
  // otherwise count as a miss.
  location?: string
}

// Either the parsed HTTP reply or a structured failure reason. Callers
// that only care about success can check `'status' in result`; the probe
// path surfaces `error` into its diagnostic summary so we can tell a TCP
// reset from a DNS failure from a budget-exhausted timeout at a glance.
export type HttpResult = HttpReply | { error: string }

// Browser-shaped User-Agent. A surprising number of consumer cameras (and
// the WAFs / NATs in front of them) reject anything that doesn't look like
// a real browser — including library / framework UAs and our previous
// custom app UA. This is the single biggest knob for probe success rate
// against Shodan-discovered cams.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Workers `fetch()` is unreliable for direct-IP plaintext HTTP probing: it can
 * rewrite non-80 ports or return Cloudflare's own direct-IP block page. Use raw
 * sockets for plaintext HTTP; keep `fetch()` for HTTPS.
 *
 * `cloudflare:sockets` exists only in the Workers runtime, so we resolve
 * the module lazily via a variable specifier — that way Vite/Rollup don't
 * try to inline it during the node-server dev build (where it doesn't
 * exist). In node-server dev, Node's `fetch()` has neither the port rewrite
 * nor the Cloudflare 1003 direct-IP behavior, so we fall back to fetch there.
 */
type SocketsConnect = (opts: {
  hostname: string
  port: number
  secureTransport?: 'off' | 'on' | 'starttls'
  allowHalfOpen?: boolean
}) => {
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
  close: () => Promise<void>
}

let socketsConnect: SocketsConnect | null | undefined
async function getSocketsConnect(): Promise<SocketsConnect | null> {
  if (socketsConnect !== undefined) return socketsConnect
  try {
    const spec = 'cloudflare:sockets'
    const mod = (await import(spec)) as { connect: SocketsConnect }
    socketsConnect = mod.connect ?? null
  } catch {
    socketsConnect = null
  }
  return socketsConnect
}

interface RawHttpOptions {
  httpVersion?: '1.0' | '1.1'
  hostHeader?: string
  connection?: 'close' | 'keep-alive'
  closeWriter?: boolean
  allowHalfOpen?: boolean
}

function logFetchErrOnce(origin: string, msg: string): void {
  if (!rememberLogKey(loggedFetchErrors, `${origin}|${msg}`)) return
  console.log(`[ipcrawl] live probe fetch err ${origin}: ${msg}`)
}

async function rawHttpGet(
  hostname: string,
  port: number,
  path: string,
  timeoutMs: number,
  maxBytes: number,
  opts: RawHttpOptions = {},
  signal?: AbortSignal
): Promise<HttpResult> {
  const connect = await getSocketsConnect()
  if (!connect) return { error: 'sockets-unavailable' }

  const origin = `http://${hostname}:${port}`
  let socket: ReturnType<SocketsConnect> | null = null
  let cancelRead: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let timedOut = false

  // Single teardown path shared by the wall-clock timer and an external abort
  // signal. Cancelling the *reader* is what actually unblocks a pending
  // `reader.read()` — closing the socket alone doesn't reliably wake a read a
  // silent camera has left hanging, which is how a stuck fetch used to wedge the
  // shared in-flight promise and 504 every future poll for that cam.
  const abort = () => {
    timedOut = true
    cancelRead?.()
    socket?.close().catch(() => {})
  }

  try {
    socket = connect({
      hostname,
      port,
      secureTransport: 'off',
      allowHalfOpen: opts.allowHalfOpen ?? true
    })

    timer = setTimeout(abort, timeoutMs)

    if (signal?.aborted) {
      return { error: 'aborted' }
    }
    signal?.addEventListener('abort', abort, { once: true })

    // HTTP/1.1 + `Connection: close` so cameras know the request is complete
    // from the blank-line header terminator, then close when the response is
    // done. Do not half-close the client write side here: some Axis-style
    // camera stacks immediately close without a response when they receive
    // FIN before sending headers, even though a browser-style open socket gets
    // a normal JPEG response.
    // Browser-shaped headers because many consumer camera firmwares (and
    // routers in front of them) drop or 403 anything that doesn't look like
    // Chrome — our previous custom app UA tripped that filter on every
    // production probe even though the cam happily serves the same path to
    // an actual browser.
    const hostHeader = opts.hostHeader ?? (port === 80 ? hostname : `${hostname}:${port}`)
    const httpVersion = opts.httpVersion ?? '1.1'
    const connection = opts.connection ?? 'close'
    const reqHead = [
      `GET ${path} HTTP/${httpVersion}`,
      `Host: ${hostHeader}`,
      `User-Agent: ${BROWSER_UA}`,
      `Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8`,
      `Accept-Language: en-US,en;q=0.9`,
      `Accept-Encoding: identity`,
      `Connection: ${connection}`,
      '',
      ''
    ].join('\r\n')

    const writer = socket.writable.getWriter()
    await writer.write(new TextEncoder().encode(reqHead))
    if (opts.closeWriter ?? false) await writer.close().catch(() => {})
    else writer.releaseLock()

    const reader = socket.readable.getReader()
    cancelRead = () => {
      reader.cancel().catch(() => {})
    }
    const chunks: Uint8Array[] = []
    let total = 0
    let headerEnd = -1
    let bodyTooLarge = false

    // Hard ceiling: body cap + 16 KiB headroom for response headers. Anything
    // past that and we bail — the cam is streaming MJPEG or returning a
    // multi-megabyte HTML page neither of which we want.
    const ceiling = maxBytes + 16 * 1024
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value || value.length === 0) continue
      chunks.push(value)
      total += value.length

      if (headerEnd < 0) {
        // Scan only the latest chunk plus a small tail of the previous one,
        // so we don't quadratic-scan the whole buffer on every read. The
        // 3-byte tail covers a CRLF-CRLF straddling a chunk boundary.
        const prev = chunks.length >= 2 ? chunks[chunks.length - 2] : undefined
        const search = prev
          ? concat([prev.subarray(Math.max(0, prev.length - 3)), value])
          : value
        const idx = indexOfCRLFCRLF(search)
        if (idx >= 0) {
          headerEnd = total - search.length + idx + 4
        }
      }

      if (headerEnd >= 0 && total - headerEnd > maxBytes) {
        bodyTooLarge = true
        break
      }
      if (total > ceiling) {
        bodyTooLarge = true
        break
      }
    }
    await reader.cancel().catch(() => {})

    if (timedOut) return { error: `tcp-timeout-${timeoutMs}ms` }
    if (headerEnd < 0) return { error: 'tcp-no-headers' }

    const all = concat(chunks)
    const headerText = new TextDecoder('latin1').decode(all.subarray(0, headerEnd - 4))
    const lines = headerText.split('\r\n')
    const statusMatch = /^HTTP\/\d\.\d\s+(\d{3})/.exec(lines[0] || '')
    if (!statusMatch) return { error: 'tcp-bad-status-line' }
    const status = Number(statusMatch[1])

    let contentType = ''
    let location = ''
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      const sep = line.indexOf(':')
      if (sep < 0) continue
      const name = line.slice(0, sep).trim().toLowerCase()
      if (name === 'content-type') {
        contentType = line.slice(sep + 1).trim().toLowerCase()
      } else if (name === 'location') {
        location = line.slice(sep + 1).trim()
      }
    }

    const body = all.subarray(headerEnd, Math.min(headerEnd + maxBytes, all.length))
    return { status, contentType, body, bodyTooLarge, location: location || undefined }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const reason = timedOut ? `tcp-timeout-${timeoutMs}ms` : `tcp:${msg}`
    logFetchErrOnce(origin, reason)
    return { error: reason }
  } finally {
    if (timer) clearTimeout(timer)
    if (socket) await socket.close().catch(() => {})
  }
}

function indexOfCRLFCRLF(buf: Uint8Array): number {
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) {
      return i
    }
  }
  return -1
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

const REDIRECT_STATUSES = new Set<number>([301, 302, 303, 307, 308])

// Resolve a redirect target for a raw-socket reply, or null if it isn't a
// redirect we should chase. Cross-scheme targets (http→https) are fine: the
// recursion re-dispatches through httpGet, which picks the fetch() transport
// for the https hop.
function redirectTarget(currentUrl: string, reply: HttpReply): string | null {
  if (!REDIRECT_STATUSES.has(reply.status) || !reply.location) return null
  try {
    const next = new URL(reply.location, currentUrl).toString()
    return next === currentUrl ? null : next
  } catch {
    return null
  }
}

/**
 * Picks the right transport per URL: raw TCP socket for plaintext HTTP,
 * `fetch()` for HTTPS. Always returns a structured failure instead of
 * throwing.
 */
export async function httpGet(
  url: string,
  timeoutMs: number,
  maxBytes: number,
  allowPartial = false,
  redirectsLeft = 3,
  signal?: AbortSignal
): Promise<HttpResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { error: 'bad-url' }
  }

  const isHttp = parsed.protocol === 'http:'
  const port = parsed.port ? Number(parsed.port) : (isHttp ? 80 : 443)
  const usesSockets = isHttp

  if (usesSockets) {
    const sock = await rawHttpGet(
      parsed.hostname,
      port,
      `${parsed.pathname}${parsed.search}` || '/',
      timeoutMs,
      maxBytes,
      {},
      signal
    )
    // In prod, a TCP-layer failure should NOT fall through to fetch(): Workers'
    // HTTP pipeline either opens the wrong port or short-circuits direct-IP
    // requests with Cloudflare's own 1003 response. Fall through only when
    // the sockets module itself isn't importable (i.e. node-server dev), where
    // Node's fetch has no port restrictions or Cloudflare edge behavior.
    if ('status' in sock) {
      const next = redirectsLeft > 0 ? redirectTarget(url, sock) : null
      if (next) return httpGet(next, timeoutMs, maxBytes, allowPartial, redirectsLeft - 1, signal)
      return sock
    }
    if (sock.error !== 'sockets-unavailable') return sock
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: signal ?? ctrl.signal,
      redirect: 'follow',
      headers: {
        // Same browser-shaped headers as the raw TCP path — see BROWSER_UA.
        'User-Agent': BROWSER_UA,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (!res.ok) {
      // Drain to release the socket before returning the status to the caller.
      const { body, tooLarge } = await readBoundedBody(res, maxBytes, allowPartial)
      return { status: res.status, contentType, body, bodyTooLarge: tooLarge }
    }
    const { body, tooLarge } = await readBoundedBody(res, maxBytes, allowPartial)
    return { status: res.status, contentType, body, bodyTooLarge: tooLarge }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const reason = ctrl.signal.aborted ? `fetch-timeout-${timeoutMs}ms` : `fetch:${msg}`
    logFetchErrOnce(parsed.origin, reason)
    return { error: reason }
  } finally {
    clearTimeout(timer)
  }
}

async function readBoundedBody(
  res: Response,
  maxBytes: number,
  allowPartial: boolean
): Promise<{ body: Uint8Array, tooLarge: boolean }> {
  const declared = Number(res.headers.get('content-length') || 0)
  if (declared > maxBytes && !allowPartial) {
    await res.body?.cancel().catch(() => {})
    return { body: new Uint8Array(0), tooLarge: true }
  }
  const reader = res.body?.getReader()
  if (!reader) return { body: new Uint8Array(0), tooLarge: false }
  const chunks: Uint8Array[] = []
  let total = 0
  let tooLarge = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      if (total + value.length > maxBytes) {
        const remaining = Math.max(0, maxBytes - total)
        if (remaining > 0) chunks.push(value.subarray(0, remaining))
        tooLarge = true
        await reader.cancel().catch(() => {})
        break
      }
      total += value.length
      chunks.push(value)
    }
  } catch {
    return { body: new Uint8Array(0), tooLarge: false }
  }
  return { body: concat(chunks), tooLarge }
}
