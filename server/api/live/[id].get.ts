import {
  EDGE_CACHE_HEADER,
  EDGE_KILL_SWITCH_HEADER,
  FRAME_SOURCE_CACHE,
  FRAME_SOURCE_HEADER,
  FRAME_SOURCE_LIVE,
  FRAME_SOURCE_SHODAN
} from '#shared/liveFrame'
import { parseImageCamIdParam } from '../../utils/apiParams'
import { findCam, getScreenshotBytes } from '../../utils/camStore'
import { defaultEdgeCache, edgeCacheKeyFor, type EdgeRuntimeContext } from '../../utils/edgeCache'
import { CACHE_CONTROL, contentEtag, etagMatches, HTTP_HEADER, setNotModified } from '../../utils/httpCache'
import { getLiveFrame } from '../../utils/liveSnapshot'
import { getOpsSwitchState } from '../../utils/opsSwitch'
import { RATE_LIMIT_BINDINGS, type RateLimitEnv } from '../../utils/rateLimit'

/**
 * Best-effort live frame endpoint. Expensive work is protected by Workers
 * cache, per-IP rate limiting, and the ops kill switch; fallback is always the
 * cached screenshot.
 */
export default defineEventHandler(async (event) => {
  const id = parseImageCamIdParam(getRouterParam(event, 'id'))

  // Live frames churn every poll; the Shodan still only changes on the daily
  // refresh (or a live-frame persist). Caching the static fallback much longer
  // means viewers of a non-live cam fan into one origin read (one Worker
  // invocation + one R2 GET) per cam per window instead of one per poll.
  const ifNoneMatch = getRequestHeader(event, HTTP_HEADER.ifNoneMatch)

  // Nitro CF preset spreads `_platform` into `event.context` during onRequest,
  // so both the rate-limit binding and the top-level `waitUntil` shim live
  // directly on the context. In node-server dev neither is present and we
  // gracefully fall through.
  const ctx = event.context as EdgeRuntimeContext & { cloudflare?: { env?: RateLimitEnv } }
  const waitUntil = ctx.waitUntil

  // Probe the edge cache *before* any metadata lookup: a hot cam's frame is
  // served straight from the Cache API, so the common polling case never
  // touches D1 (the `findCam` below only runs on an edge miss).
  const edgeCache = defaultEdgeCache()
  const edgeCacheKey = edgeCache
    ? edgeCacheKeyFor(getRequestURL(event).toString())
    : null
  if (edgeCache && edgeCacheKey) {
    const cached = await edgeCache.match(edgeCacheKey).catch(() => undefined)
    if (cached) {
      const cachedEtag = cached.headers.get(HTTP_HEADER.etag)
      const cachedSource = cached.headers.get(FRAME_SOURCE_HEADER) || FRAME_SOURCE_CACHE
      if (cachedEtag && etagMatches(ifNoneMatch, cachedEtag)) {
        const cachedControl = cached.headers.get(HTTP_HEADER.cacheControl) || CACHE_CONTROL.liveFrame
        return setNotModified(event, cachedControl, cachedEtag, { [FRAME_SOURCE_HEADER]: cachedSource })
      }

      const headers = new Headers(cached.headers)
      headers.set(EDGE_CACHE_HEADER, 'hit')
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers
      })
    }
  }

  const cam = await findCam(id)
  if (!cam) {
    throw createError({ statusCode: 404, statusMessage: 'Cam not found' })
  }

  const limiter = ctx.cloudflare?.env?.[RATE_LIMIT_BINDINGS.live]
  const clientIp = getRequestHeader(event, 'cf-connecting-ip')
  const opsSwitch = await getOpsSwitchState()
  let allowLive = !opsSwitch.expensiveWorkDisabled
  if (limiter && clientIp) {
    try {
      const { success } = await limiter.limit({ key: `live:${clientIp}` })
      allowLive = allowLive && success
    } catch (err) {
      allowLive = false
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[ipcrawl] live limiter failed closed: ${msg}`)
    }
  } else if (limiter && !clientIp) {
    allowLive = false
  }

  const live = allowLive ? await getLiveFrame(cam, { waitUntil }) : null

  let bytes: Uint8Array | null
  let mime: string
  let source: typeof FRAME_SOURCE_LIVE | typeof FRAME_SOURCE_SHODAN
  let etag: string

  if (live) {
    bytes = live.data
    mime = live.mime
    source = FRAME_SOURCE_LIVE
    etag = `"${FRAME_SOURCE_LIVE}-${cam.id}-${live.fetchedAt}"`
  } else {
    bytes = await getScreenshotBytes(cam)
    mime = cam.screenshotMime
    source = FRAME_SOURCE_SHODAN
    etag = bytes ? contentEtag(FRAME_SOURCE_SHODAN, cam.id, bytes) : ''
  }

  if (!bytes) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Screenshot unavailable. Refresh in a moment.'
    })
  }

  const cacheControl = source === FRAME_SOURCE_LIVE ? CACHE_CONTROL.liveFrame : CACHE_CONTROL.shodanFrame

  if (etagMatches(ifNoneMatch, etag)) {
    return setNotModified(event, cacheControl, etag, { [FRAME_SOURCE_HEADER]: source })
  }

  const headers = new Headers({
    [HTTP_HEADER.contentType]: mime,
    [HTTP_HEADER.contentLength]: String(bytes.length),
    [HTTP_HEADER.cacheControl]: cacheControl,
    [HTTP_HEADER.etag]: etag,
    [FRAME_SOURCE_HEADER]: source,
    [EDGE_CACHE_HEADER]: 'miss'
  })
  if (opsSwitch.expensiveWorkDisabled) {
    headers.set(EDGE_KILL_SWITCH_HEADER, opsSwitch.source ?? 'on')
  }

  const response = new Response(bytes as unknown as BodyInit, { headers })
  if (edgeCache && edgeCacheKey) {
    const cachePut = edgeCache.put(edgeCacheKey, response.clone())
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[ipcrawl] live edge cache put failed: ${msg}`)
      })
    if (waitUntil) waitUntil(cachePut)
    else void cachePut
  }

  return response
})
