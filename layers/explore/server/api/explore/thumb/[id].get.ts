import type { H3Event } from 'h3'
import { EDGE_CACHE_HEADER, FRAME_SOURCE_HEADER, FRAME_SOURCE_THUMB } from '#shared/liveFrame'
import { parseImageCamIdParam } from '~~/server/utils/apiParams'
import { findCam, getScreenshotBytes, type CamMeta } from '~~/server/utils/camStore'
import { defaultEdgeCache, edgeCacheKeyFor, type EdgeRuntimeContext } from '~~/server/utils/edgeCache'
import { getCamScreenshotMime } from '~~/server/utils/exploreStore'
import { CACHE_CONTROL, contentEtag, etagMatches, HTTP_HEADER, setNotModified } from '~~/server/utils/httpCache'

/**
 * Grid thumbnail: serves the cached R2 still ONLY — it never triggers a live
 * probe and isn't behind the live rate limiter. That's the whole point of the
 * split (see Plan 2 open questions): the grid can fan out many cards cheaply
 * because each thumbnail is just heavily-cached bytes, while the dialog's live
 * view uses the stricter `/api/live/[id]` path.
 *
 * Shielded by the Workers Cache API (caches.default), keyed by the stable
 * per-cam URL. Without it, every fresh grid render fired one R2 GetObject (and
 * a D1 findCam) per card — up to 24 per page, the dominant R2 Class B cost
 * under load. Now the first request for a thumb fills the edge cache and every
 * other viewer in the s-maxage window is served those bytes with no R2/D1 hit.
 * Mirrors the edge-cache pattern in /api/live/[id]. (Lower s-maxage below if
 * you want grid stills to track live-frame persists / refreshes more tightly.)
 */
export default defineEventHandler(async (event: H3Event) => {
  const id = parseImageCamIdParam(getRouterParam(event, 'id'))
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cam id' })
  }

  const cacheControl = CACHE_CONTROL.exploreThumb
  const ifNoneMatch = getRequestHeader(event, HTTP_HEADER.ifNoneMatch)

  const ctx = event.context as EdgeRuntimeContext
  const waitUntil = ctx.waitUntil

  // Probe the edge cache before any D1/R2 work. The thumb URL is stable per cam
  // (no rotating query), so all viewers share one entry for the cache window —
  // the common polling/scrolling case never touches the origin.
  const edgeCache = defaultEdgeCache()
  const edgeCacheKey = edgeCache
    ? edgeCacheKeyFor(getRequestURL(event).toString())
    : null
  if (edgeCache && edgeCacheKey) {
    const cached = await edgeCache.match(edgeCacheKey).catch(() => undefined)
    if (cached) {
      const cachedEtag = cached.headers.get(HTTP_HEADER.etag)
      if (cachedEtag && etagMatches(ifNoneMatch, cachedEtag)) {
        return setNotModified(event, cacheControl, cachedEtag)
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

  // Prefer the shared D1-backed cam lookup; fall back to the mime-only helper so
  // a partial row can still serve a retained R2 thumbnail.
  let cam = await findCam(id)
  if (!cam) {
    const mime = await getCamScreenshotMime(id, event)
    if (!mime) throw createError({ statusCode: 404, statusMessage: 'Cam not found' })
    cam = { id, screenshotMime: mime } as CamMeta
  }

  const bytes = await getScreenshotBytes(cam)
  if (!bytes) {
    throw createError({ statusCode: 404, statusMessage: 'Thumbnail unavailable' })
  }

  const etag = contentEtag(FRAME_SOURCE_THUMB, id, bytes)
  const response = new Response(bytes as unknown as BodyInit, {
    headers: {
      [HTTP_HEADER.contentType]: cam.screenshotMime,
      [HTTP_HEADER.contentLength]: String(bytes.length),
      [HTTP_HEADER.cacheControl]: cacheControl,
      [HTTP_HEADER.etag]: etag,
      [FRAME_SOURCE_HEADER]: FRAME_SOURCE_THUMB,
      [EDGE_CACHE_HEADER]: 'miss'
    }
  })

  // Fill the edge cache even when this request ends up a 304: we already paid
  // the R2 read to fingerprint the bytes, so storing the 200 lets the next
  // viewer skip the origin entirely.
  if (edgeCache && edgeCacheKey) {
    const cachePut = edgeCache.put(edgeCacheKey, response.clone()).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[ipcrawl] thumb edge cache put failed: ${msg}`)
    })
    if (waitUntil) waitUntil(cachePut)
    else void cachePut
  }

  if (etagMatches(ifNoneMatch, etag)) {
    return setNotModified(event, cacheControl, etag)
  }

  return response
})
