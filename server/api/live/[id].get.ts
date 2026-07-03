import {
  EDGE_CACHE_HEADER,
  EDGE_KILL_SWITCH_HEADER,
  FRAME_SOURCE_HEADER,
  FRAME_SOURCE_LIVE,
  FRAME_SOURCE_SHODAN
} from '#shared/liveFrame'
import { parseImageCamIdParam } from '../../utils/apiParams'
import { findCam, getScreenshotBytes } from '../../utils/camStore'
import type { EdgeRuntimeContext } from '../../utils/edgeCache'
import { CACHE_CONTROL, contentEtag, etagMatches, HTTP_HEADER, setNotModified } from '../../utils/httpCache'
import { getLiveFrame } from '../../utils/liveSnapshot'
import { getOpsSwitchState } from '../../utils/opsSwitch'
import { getClientIp, isFallbackLimited, RATE_LIMIT_BINDINGS } from '../../utils/rateLimit'

/**
 * Best-effort live frame endpoint. Expensive work is protected by per-IP rate
 * limiting and the ops kill switch; fallback is always the cached screenshot.
 */
export default defineEventHandler(async (event) => {
  const id = parseImageCamIdParam(getRouterParam(event, 'id'))

  const ifNoneMatch = getRequestHeader(event, HTTP_HEADER.ifNoneMatch)

  const ctx = event.context as EdgeRuntimeContext
  const waitUntil = ctx.waitUntil

  const cam = await findCam(id)
  if (!cam) {
    throw createError({ statusCode: 404, statusMessage: 'Cam not found' })
  }

  const opsSwitch = await getOpsSwitchState()
  let allowLive = !opsSwitch.expensiveWorkDisabled

  const ip = getClientIp(event)
  if (ip === 'unknown' || isFallbackLimited(RATE_LIMIT_BINDINGS.live, `live:${ip}`)) {
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

  return new Response(bytes as unknown as BodyInit, { headers })
})
