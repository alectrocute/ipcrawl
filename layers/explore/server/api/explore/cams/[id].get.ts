import type { ExploreCamDetail } from '#shared/explore'
import { getCamDetail } from '~~/server/utils/exploreStore'
import { assertRateLimit, RATE_LIMIT_BINDINGS } from '~~/server/utils/rateLimit'

/** Full metadata for the single-camera dialog. */
export default defineEventHandler(async (event): Promise<ExploreCamDetail> => {
  // Behind the per-id SWR route rule — only origin misses are metered.
  await assertRateLimit(event, RATE_LIMIT_BINDINGS.api)
  const id = (getRouterParam(event, 'id') || '').trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cam id' })
  }

  const detail = await getCamDetail(id, event)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: 'Cam not found' })
  }

  return detail
})
