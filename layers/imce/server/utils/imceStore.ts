import type { H3Event } from 'h3'
import type { ImceCamera, ImceNearbyResponse } from '#shared/imce'
import { IMCE_MAX_CAMERAS, IMCE_MAX_CANDIDATES, haversineKm, radiusBBox } from '#shared/imce'
import { apiExploreThumbPath } from '#shared/routes'
import { getExploreDb } from '~~/server/utils/exploreDb'

interface NearbyRow {
  id: string
  lat: number
  lon: number
  is_live: number
}

/**
 * Scan the catalogue for cameras within `radiusKm` of the visitor.
 *
 * Two stages keep this cheap: a bbox `WHERE` (backed by idx_cams_geo) bounds the
 * rows touched to a small square around the visitor, then we refine the
 * survivors with the exact haversine distance so the result is a true circle,
 * not a square. The candidate cap bounds D1 work in dense metros; when it bites,
 * `truncated` flags that `count` is a floor rather than the exact total.
 */
export async function queryNearby(
  lat: number,
  lon: number,
  radiusKm: number,
  event?: H3Event
): Promise<ImceNearbyResponse> {
  const db = await getExploreDb(event)
  const box = radiusBBox(lat, lon, radiusKm)

  const rows = await db
    .prepare(
      `SELECT id, lat, lon, is_live
       FROM cams
       WHERE lat IS NOT NULL AND lon IS NOT NULL
         AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
       LIMIT ?`
    )
    .bind(box.s, box.n, box.w, box.e, IMCE_MAX_CANDIDATES + 1)
    .all<NearbyRow>()

  const truncated = rows.results.length > IMCE_MAX_CANDIDATES
  const candidates = truncated ? rows.results.slice(0, IMCE_MAX_CANDIDATES) : rows.results

  let count = 0
  let liveCount = 0
  let nearestKm: number | null = null
  const within: ImceCamera[] = []

  for (const row of candidates) {
    const distanceKm = haversineKm(lat, lon, row.lat, row.lon)
    if (distanceKm > radiusKm) continue
    count++
    if (row.is_live === 1) liveCount++
    if (nearestKm === null || distanceKm < nearestKm) nearestKm = distanceKm
    within.push({
      id: row.id,
      lat: row.lat,
      lon: row.lon,
      live: row.is_live === 1,
      thumb: apiExploreThumbPath(row.id),
      distanceKm
    })
  }

  within.sort((a, b) => a.distanceKm - b.distanceKm)

  return {
    count,
    liveCount,
    radiusKm,
    nearestKm,
    cameras: within.slice(0, IMCE_MAX_CAMERAS),
    truncated
  }
}
