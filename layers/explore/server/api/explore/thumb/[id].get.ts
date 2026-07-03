import type { H3Event } from 'h3'
import { EDGE_CACHE_HEADER, FRAME_SOURCE_HEADER, FRAME_SOURCE_THUMB } from '#shared/liveFrame'
import { parseImageCamIdParam } from '~~/server/utils/apiParams'
import { findCam, getScreenshotBytes, type CamMeta } from '~~/server/utils/camStore'
import { getCamScreenshotMime } from '~~/server/utils/exploreStore'
import { CACHE_CONTROL, contentEtag, etagMatches, HTTP_HEADER, setNotModified } from '~~/server/utils/httpCache'
import { assertThumbRateLimit } from '~~/server/utils/thumbRateLimit'

/**
 * Grid thumbnail: serves the cached still ONLY — it never triggers a live
 * probe and isn't behind the live rate limiter. The grid can fan out many
 * cards cheaply because each thumbnail is just heavily-cached bytes, while the
 * dialog's live view uses the stricter `/api/live/[id]` path. Origin misses
 * are rate-limited per IP to stop strip-miners.
 */
export default defineEventHandler(async (event: H3Event) => {
  const id = parseImageCamIdParam(getRouterParam(event, 'id'))
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cam id' })
  }

  const cacheControl = CACHE_CONTROL.exploreThumb
  const ifNoneMatch = getRequestHeader(event, HTTP_HEADER.ifNoneMatch)

  await assertThumbRateLimit(event)

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

  if (etagMatches(ifNoneMatch, etag)) {
    return setNotModified(event, cacheControl, etag)
  }

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      [HTTP_HEADER.contentType]: cam.screenshotMime,
      [HTTP_HEADER.contentLength]: String(bytes.length),
      [HTTP_HEADER.cacheControl]: cacheControl,
      [HTTP_HEADER.etag]: etag,
      [FRAME_SOURCE_HEADER]: FRAME_SOURCE_THUMB,
      [EDGE_CACHE_HEADER]: 'miss'
    }
  })
})
