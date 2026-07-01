import type { ImceNearbyResponse } from '#shared/imce'
import { clampRadiusKm } from '#shared/imce'
import { clampLat, clampLon, toQueryNum } from '#shared/map'
import { queryNearby } from '~~/layers/imce/server/utils/imceStore'
import { assertRateLimit, RATE_LIMIT_BINDINGS } from '~~/server/utils/rateLimit'

/**
 * "Is My Camera Exposed?" scan: given the visitor's coordinates, count the open
 * cameras within a radius and return a nearest-first sample for the alert.
 *
 * The query string is unique per visitor (their exact lat/lon), so there's no
 * fan-out to collapse — this is deliberately NOT route-rule cached. The shared
 * API rate limit, checked here before any D1 work, is the cost shield against a
 * scraper sweeping coordinates.
 */
export default defineEventHandler(async (event): Promise<ImceNearbyResponse> => {
  await assertRateLimit(event, RATE_LIMIT_BINDINGS.api)
  const q = getQuery(event)

  const lat = toQueryNum(q.lat, Number.NaN)
  const lon = toQueryNum(q.lon, Number.NaN)
  const radiusKm = clampRadiusKm(q.radius)

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw createError({ statusCode: 400, statusMessage: 'lat and lon are required' })
  }

  try {
    return await queryNearby(clampLat(lat), clampLon(lon), radiusKm, event)
  } catch (err) {
    // A cold / unmigrated DB shouldn't 500 the scan — degrade to "found
    // nothing" so the page still resolves to a (reassuring) result.
    console.error('[ipcrawl] /api/imce/nearby failed:', err)
    return { count: 0, liveCount: 0, radiusKm, nearestKm: null, cameras: [], truncated: false }
  }
})
