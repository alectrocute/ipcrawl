import { countActiveCams, findCam } from '~~/server/utils/camStore'
import { buildCamPayload } from '~~/server/utils/camPayload'
import { CACHE_CONTROL, HTTP_HEADER } from '~~/server/utils/httpCache'

/**
 * Returns metadata for a specific cam by id. Unlike /api/cam (random,
 * uncacheable), this endpoint is keyed by id and therefore safely cacheable
 * across users — same id always yields the same metadata until the next
 * scheduled refresh.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''

  const cam = await findCam(id)
  if (!cam) {
    throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  }

  // The total is useful to the client; a cached COUNT avoids hydrating the
  // whole active list just to read its length.
  const total = await countActiveCams()

  // 5 min fresh, 10 min stale-while-revalidate. The daily cam refresh is slow
  // enough that this still leaves plenty of churn between channel payloads.
  setResponseHeader(
    event,
    HTTP_HEADER.cacheControl,
    CACHE_CONTROL.funChannel
  )

  return await buildCamPayload(cam, total)
})
