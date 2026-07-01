import {
  readLiveProbeCache,
  writeLiveProbeCache,
  writeScreenshotBytes,
  type CamMeta
} from './camStore'
import { httpGet, probeBase, rememberLogKey, type HttpResult } from './live/httpClient'
import { coerceImageFrame, type FrameData } from './live/imageFrame'
import { probeSnapshot } from './live/probe'
import { getLiveTimingMs } from './live/timing'
import { isLiveProbeReachable } from './liveProbeStatus'
import { readBooleanFlag } from './runtimeFlags'

/**
 * Per-cam live snapshot machinery.
 *
 * On first request for a cam we probe a list of well-known JPEG snapshot
 * endpoints common to consumer IP cameras (see `live/snapshotPaths.ts` /
 * `live/probe.ts`). The first path that returns a valid image is remembered.
 * Frames are cached for `liveFrameCache` so a swarm of polling viewers
 * doesn't melt the upstream camera, and concurrent fetches are deduped
 * through a single in-flight Promise — there is at most one probe and one
 * fetch in flight per cam id per isolate at any time.
 *
 * Fresh frames can be written back to R2. A local throttle avoids hot-looping
 * KV, and a KV marker bounds write-through across isolates.
 *
 * Anything we can't reach quietly falls back to the cached Shodan screenshot
 * (handled at the endpoint level), so the UI never stalls.
 */

// Hard ceiling for a single frame. Protects us from MJPEG endpoints that
// mislabel themselves as image/jpeg — we'd otherwise stream forever into
// arrayBuffer until the timeout fires.
const MAX_FRAME_BYTES = 4 * 1024 * 1024

interface FetchResult {
  frame: FrameData | null
  persist?: Promise<void>
}

interface CamLiveState {
  snapshotPath?: string | null
  probedAt?: number
  probing?: Promise<string | null>
  fetching?: Promise<FetchResult>
  lastFrame?: Uint8Array
  lastFrameMime?: string
  lastFrameAt?: number
  persistCheckedAt?: number
  // The snapshot path whose live state we've already mirrored to D1
  // (is_live=1, live_path=path) in this isolate. A confirmed-live fetch only
  // writes when this doesn't match the path it just pulled, so the steady
  // state — probe (or cold-cache hydrate) already synced this path — costs
  // zero extra D1 writes.
  liveSyncedPath?: string
  // Set once per isolate the first time we skip a non-HTTP cam, so the
  // "skipping" diagnostic only fires once instead of on every poll.
  skipLogged?: boolean
}

// Bounded LRU: a long-lived isolate that touches thousands of cams would
// otherwise accumulate a frame buffer (~50KB) per cam forever. 256 entries
// caps worst-case retained frames at ~13MB.
const MAX_TRACKED_CAMS = 256
const states = new Map<string, CamLiveState>()

function getState(id: string): CamLiveState {
  let s = states.get(id)
  if (s) {
    // Refresh recency so hot cams survive eviction (Map preserves insertion
    // order, so delete + re-set makes this an LRU).
    states.delete(id)
  } else {
    s = {}
    if (states.size >= MAX_TRACKED_CAMS) {
      const oldest = states.keys().next().value
      if (oldest !== undefined) states.delete(oldest)
    }
  }
  states.set(id, s)
  return s
}

// --- Durable probe cache (D1) -----------------------------------------------
//
// The in-memory `states` Map only spans one isolate. On Workers each request
// may land in a different isolate, so without a durable cache every cold
// isolate would re-probe — wasting time on the request and racing other
// isolates for the same upstream camera. We persist the probe result in the
// cam's D1 row so KV is reserved for live-frame persist gating.

interface ProbeCacheEntry { path: string | null, at: number }
interface PersistGateEntry { at: number }

async function loadProbeCache(id: string): Promise<ProbeCacheEntry | null> {
  try {
    return await readLiveProbeCache(id)
  } catch {
    return null
  }
}

async function saveProbeCache(id: string, path: string | null): Promise<boolean> {
  try {
    await writeLiveProbeCache(id, path)
    return true
  } catch {
    // D1 unavailable or transient failure — best effort.
    return false
  }
}

async function reservePersistSlot(id: string, now: number): Promise<boolean> {
  const { liveFramePersistGlobal } = getLiveTimingMs()
  const storage = useStorage('cams')
  const key = `livepersist:${id}`
  try {
    const cached = await storage.getItem<PersistGateEntry>(key)
    if (cached && now - cached.at < liveFramePersistGlobal) return false

    await storage.setItem(key, { at: now } satisfies PersistGateEntry)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ipcrawl] live persist gate failed closed for ${id}: ${msg}`)
    return false
  }
}

function maybePersistFrame(
  cam: CamMeta,
  state: CamLiveState,
  frame: FrameData,
  enabled: boolean,
  now: number
): Promise<void> | undefined {
  const { liveFramePersistLocal } = getLiveTimingMs()
  if (!enabled || frame.mime !== cam.screenshotMime) return undefined
  if (state.persistCheckedAt && now - state.persistCheckedAt <= liveFramePersistLocal) {
    return undefined
  }

  state.persistCheckedAt = now
  return reservePersistSlot(cam.id, now).then(async (reserved) => {
    if (!reserved) return
    await writeScreenshotBytes(cam.id, frame.mime, frame.body)
    console.log(`[ipcrawl] live frame persisted ${cam.id} (${frame.body.length} bytes)`)
  }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ipcrawl] live frame persist failed for ${cam.id}: ${msg}`)
  })
}

/**
 * Confirm a cam's liveness in D1 from an *actually delivered* frame, not just
 * from probe discovery. The probe mirrors `is_live` when it finds a path and a
 * cold isolate hydrates the same marker from the cache row, so this normally
 * no-ops — it only writes when the in-memory marker doesn't match the path we
 * just fetched (e.g. the probe's own cache write was dropped, leaving a working
 * cam stuck at is_live=0). One write per (isolate, cam, path) transition; zero
 * in steady state. Returns the write promise (for `waitUntil`) or undefined.
 */
function maybeMarkLive(
  cam: CamMeta,
  state: CamLiveState,
  path: string
): Promise<void> | undefined {
  if (state.liveSyncedPath === path) return undefined
  // Optimistic: we're issuing the write now, so dedup concurrent fetches in
  // this isolate. Roll back only if the write is confirmed to have failed, so
  // a later fetch retries the correction.
  state.liveSyncedPath = path
  return saveProbeCache(cam.id, path).then((ok) => {
    if (!ok) state.liveSyncedPath = undefined
  })
}

/** Merge optional tail-promises into one (or undefined) for a single waitUntil. */
function joinTail(
  ...tasks: (Promise<void> | undefined)[]
): Promise<void> | undefined {
  const active = tasks.filter((t): t is Promise<void> => t !== undefined)
  if (active.length === 0) return undefined
  if (active.length === 1) return active[0]
  return Promise.all(active).then(() => undefined)
}

const loggedLiveFetchMisses = new Set<string>()

function logLiveFetchMissOnce(cam: CamMeta, path: string, reason: string): void {
  if (!rememberLogKey(loggedLiveFetchMisses, `${cam.id}|${path}|${reason}`)) return
  console.log(`[ipcrawl] live fetch miss ${cam.id} ${path} ${reason}`)
}

/**
 * Resolve `p`, or `fallback` if `ms` elapses first. A hard backstop on top of
 * httpGet's own transport timeout: even in the pathological case where a socket
 * read never settles after close()/cancel(), the returned promise still
 * resolves — so a single stuck upstream can never wedge the shared `s.fetching`
 * promise and poison every future poll for a cam in the isolate.
 */
function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(fallback)
    }, ms)
    const finish = (value: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    p.then(finish, () => finish(fallback))
  })
}

async function fetchFrame(cam: CamMeta, path: string): Promise<FrameData | null> {
  const { liveFetchTimeout } = getLiveTimingMs()
  // httpGet enforces `liveFetchTimeout` internally (socket timer / fetch abort);
  // withDeadline is a slightly-later hard backstop guaranteeing this settles
  // even if a transport fails to honor that timeout.
  const reply = await withDeadline<HttpResult>(
    httpGet(`${probeBase(cam)}${path}`, liveFetchTimeout, MAX_FRAME_BYTES),
    liveFetchTimeout + 500,
    { error: `live-fetch-deadline-${liveFetchTimeout}ms` }
  )
  if (!('status' in reply)) {
    console.log(`[ipcrawl] live fetch err ${cam.id} ${path}: ${reply.error}`)
    return null
  }
  if (reply.status < 200 || reply.status >= 300) {
    logLiveFetchMissOnce(cam, path, `status=${reply.status} ct=${reply.contentType || '(none)'}`)
    return null
  }
  if (reply.bodyTooLarge) {
    logLiveFetchMissOnce(cam, path, `body-too-large>${MAX_FRAME_BYTES}`)
    return null
  }
  const frame = reply.body.length ? coerceImageFrame(reply.body, reply.contentType) : null
  if (!frame) {
    const reason = reply.contentType.startsWith('image/')
      ? `body-not-image (${reply.body.length} bytes)`
      : `non-image-ct=${reply.contentType || '(none)'} body=${reply.body.length} bytes`
    logLiveFetchMissOnce(cam, path, reason)
    return null
  }
  return frame
}

interface LiveFrame {
  data: Uint8Array
  mime: string
  fetchedAt: number
}

export interface GetLiveFrameOpts {
  /**
   * Hand any tail-work (probe discovery, D1 probe-cache write, persist
   * promise) to `ctx.waitUntil` so it survives the response flush. The live
   * endpoint intentionally does not wait for first-time discovery; it returns
   * the cached Shodan still while the probe warms the per-cam path cache.
   */
  waitUntil?: (promise: Promise<unknown>) => void
}

/**
 * Returns a fresh frame from the cam, or null if we can't reach it.
 *
 * Concurrency: at most one probe and one fetch are in flight per cam id per
 * isolate. A swarm of polling viewers shares the same in-flight work, so the
 * upstream camera sees one request even when many viewers are watching the
 * same channel. The discovered snapshot path is mirrored into D1 so other
 * isolates skip the probe entirely on their first request.
 *
 * Disabled when `enableLiveProbe` is false — the live endpoint just serves
 * the cached Shodan screenshot then.
 */
export async function getLiveFrame(
  cam: CamMeta,
  opts: GetLiveFrameOpts = {}
): Promise<LiveFrame | null> {
  const { liveFrameCache, liveFrameGrace, liveProbeRetry } = getLiveTimingMs()
  const config = useRuntimeConfig()
  if (!readBooleanFlag(config.enableLiveProbe, true)) return null
  const enableLiveFramePersist = readBooleanFlag(config.enableLiveFramePersist, false)

  const s = getState(cam.id)

  // Non-HTTP services (RTSP, VNC, ...) get their stills from Shodan but can't
  // be live-probed from a Worker. Short-circuit before any probe / fetch /
  // DB work; there's nothing for us to do here and the Shodan-fallback in
  // the route will serve the cached still.
  if (!isLiveProbeReachable(cam)) {
    if (!s.skipLogged) {
      s.skipLogged = true
      console.log(
        `[ipcrawl] live probe skip  ${cam.id} (${cam.ip}:${cam.port}`
        + `${cam.module ? ` module=${cam.module}` : ''})`
      )
    }
    return null
  }

  const now = Date.now()

  if (s.lastFrame && s.lastFrameAt && now - s.lastFrameAt < liveFrameCache) {
    return {
      data: s.lastFrame,
      mime: s.lastFrameMime ?? cam.screenshotMime,
      fetchedAt: s.lastFrameAt
    }
  }

  // Cold isolate: try to hydrate the snapshot path from D1 before paying the
  // cost of a fresh probe. Honoring a cached "null" result (within the retry
  // window) is what stops every cold isolate from independently re-probing
  // confirmed-dead cameras.
  if (s.snapshotPath === undefined && !s.probing) {
    const cached = await loadProbeCache(cam.id)
    if (cached) {
      const fresh = cached.path !== null || now - cached.at < liveProbeRetry
      if (fresh) {
        s.snapshotPath = cached.path
        s.probedAt = cached.at
        // A non-null cached path means the row already carries is_live=1
        // (writeLiveProbeCache sets both atomically), so treat it as synced —
        // a confirmed-live fetch here won't re-write what's already there.
        if (cached.path) s.liveSyncedPath = cached.path
      }
    }
  }

  const needsProbe = s.snapshotPath === undefined
    || (s.snapshotPath === null && (!s.probedAt || now - s.probedAt > liveProbeRetry))

  if (needsProbe && !s.probing) {
    console.log(`[ipcrawl] live probe start ${cam.id} (${cam.ip}:${cam.port})`)
    const probePromise = probeSnapshot(cam).then((path) => {
      s.snapshotPath = path
      s.probedAt = Date.now()
      s.probing = undefined
      // Mirror to D1 so the next cold isolate doesn't re-probe. Handed to
      // waitUntil so the response flush can't kill it. Mark the path synced
      // optimistically so the follow-up fetch doesn't write it again; roll
      // back only if the write is confirmed to have failed.
      if (path) s.liveSyncedPath = path
      const save = saveProbeCache(cam.id, path).then((ok) => {
        if (!ok && path) s.liveSyncedPath = undefined
      })
      opts.waitUntil?.(save)
      return path
    }).catch((err) => {
      s.probing = undefined
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[ipcrawl] live probe failed ${cam.id}: ${msg}`)
      return null
    })
    s.probing = probePromise
    // Keep the Worker alive for probe discovery, but do not hold the
    // /api/live response open. This request falls through to the cached
    // Shodan still; later polls use `s.snapshotPath` once this Promise lands.
    opts.waitUntil?.(probePromise.catch(() => {}))
  }

  if (s.probing) return null
  if (!s.snapshotPath) return null

  // Refresh the frame in the BACKGROUND — never block the response on the
  // upstream camera fetch. That inline await was the dominant source of 504s
  // and OOM: on a popular-but-slow cam every poll hung 0.6–3s, stacking frame
  // buffers + sockets per isolate until it brushed the 128MB cap and tipped into
  // exceededMemory (which kills every in-flight request on the isolate). Now a
  // poll serves the last good frame (or the Shodan still) immediately and the
  // fetch warms `s.lastFrame` for the *next* poll, handed to `waitUntil` so it
  // survives the response flush. Deduped per cam per isolate via `s.fetching`.
  if (!s.fetching) {
    const path = s.snapshotPath
    const refresh = fetchFrame(cam, path).then((frame): FetchResult => {
      if (!frame) {
        s.fetching = undefined
        return { frame: null }
      }
      s.lastFrame = frame.body
      s.lastFrameMime = frame.mime
      s.lastFrameAt = Date.now()

      const persist = maybePersistFrame(cam, s, frame, enableLiveFramePersist, s.lastFrameAt)
      // A delivered frame is the ground truth for liveness — reconcile the D1
      // row off the actual fetch, not just probe discovery. Deduped per
      // (isolate, cam, path) so this is a no-op once the path is synced.
      const sync = maybeMarkLive(cam, s, path)

      s.fetching = undefined
      return { frame, persist: joinTail(persist, sync) }
    }).catch((err): FetchResult => {
      // fetchFrame always resolves (structured failures + the withDeadline
      // backstop), so this is defensive — but if the chain ever rejects we must
      // clear `s.fetching`, otherwise every future poll for this cam would await
      // the same rejected promise forever.
      s.fetching = undefined
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[ipcrawl] live fetch chain failed ${cam.id}: ${msg}`)
      return { frame: null }
    })
    s.fetching = refresh
    // Keep the isolate alive for the background refresh (and any persist / D1
    // sync tail it spawns) without holding the response open.
    opts.waitUntil?.(refresh.then(r => r.persist).catch(() => {}))
  }

  // Serve the most recent good live frame while it's within the grace window;
  // otherwise fall through to the cached Shodan still (handled by the route).
  // The grace window also covers the one-poll warm-up after a cold isolate's
  // first request kicks the background fetch above.
  if (s.lastFrame && s.lastFrameAt && Date.now() - s.lastFrameAt < liveFrameGrace) {
    return {
      data: s.lastFrame,
      mime: s.lastFrameMime ?? cam.screenshotMime,
      fetchedAt: s.lastFrameAt
    }
  }
  return null
}
