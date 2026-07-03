import type { CamMeta } from '../camStore'

/**
 * Transport layer for talking to upstream cameras: `fetch()` with bounded
 * bodies, manual redirect chasing and once-per-failure-mode diagnostics.
 */

const MAX_LOGGED_KEYS = 1000
export function rememberLogKey(set: Set<string>, key: string): boolean {
  if (set.has(key)) return false
  if (set.size >= MAX_LOGGED_KEYS) set.clear()
  set.add(key)
  return true
}

const TLS_PORTS = new Set<number>([443, 8443])

export function probeBase(cam: CamMeta): string {
  const scheme = TLS_PORTS.has(cam.port) ? 'https' : 'http'
  return `${scheme}://${cam.ip}:${cam.port}`
}

const loggedFetchErrors = new Set<string>()

export interface HttpReply {
  status: number
  contentType: string
  body: Uint8Array
  bodyTooLarge?: boolean
  location?: string
}

export type HttpResult = HttpReply | { error: string }

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 IPCrawl/1.0'

function logFetchErrOnce(origin: string, msg: string): void {
  if (!rememberLogKey(loggedFetchErrors, `${origin}|${msg}`)) return
  console.log(`[ipcrawl] live probe fetch err ${origin}: ${msg}`)
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

/**
 * Fetch a URL with bounded body size and timeout. Always returns a structured
 * failure instead of throwing.
 */
export async function httpGet(
  url: string,
  timeoutMs: number,
  maxBytes: number,
  allowPartial = false,
  _redirectsLeft = 3,
  signal?: AbortSignal
): Promise<HttpResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { error: 'bad-url' }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: signal ?? ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (!res.ok) {
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
