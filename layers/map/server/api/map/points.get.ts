import type { MapQuery, MapResponse } from '#shared/map'
import {
  clampLat,
  clampLon,
  clampZoom,
  MAP_MAX_LAT,
  MAP_MIN_ZOOM,
  toQueryNum
} from '#shared/map'
import { EXPLORE_SOURCE_CACHED, EXPLORE_SOURCE_LIVE, toFilterValues } from '#shared/explore'
import { queryMapClusters } from '~~/layers/map/server/utils/mapStore'
import { assertRateLimit, RATE_LIMIT_BINDINGS } from '~~/server/utils/rateLimit'

/**
 * LOD marker feed for /map. Caching is handled by the `/api/map/points` route
 * rule (short SWR keyed by the full query string); because the client snaps the
 * bbox to grid-cell boundaries before requesting, in-cell panning resolves to
 * the same query string and folds into one origin read. The rate limit below
 * therefore only meters cache *misses* (real D1 work), shared with the other
 * D1-backed explore reads.
 */
export default defineEventHandler(async (event): Promise<MapResponse> => {
  await assertRateLimit(event, RATE_LIMIT_BINDINGS.api)
  const q = getQuery(event)

  const zoom = clampZoom(toQueryNum(q.z, MAP_MIN_ZOOM))
  const bounds = {
    w: clampLon(toQueryNum(q.w, -180)),
    s: clampLat(toQueryNum(q.s, -MAP_MAX_LAT)),
    e: clampLon(toQueryNum(q.e, 180)),
    n: clampLat(toQueryNum(q.n, MAP_MAX_LAT))
  }

  const query: MapQuery = {
    zoom,
    bounds,
    source: q.source === EXPLORE_SOURCE_LIVE ? EXPLORE_SOURCE_LIVE : EXPLORE_SOURCE_CACHED,
    countries: toFilterValues(q.country, q['country[]']),
    cities: toFilterValues(q.city, q['city[]']),
    orgs: toFilterValues(q.org, q['org[]']),
    q: typeof q.q === 'string' ? q.q.trim().slice(0, 80) : ''
  }

  try {
    return await queryMapClusters(query, event)
  } catch (err) {
    // A cold / unmigrated DB shouldn't 500 the map — degrade to no markers so
    // the canvas still renders its base layer instead of an error.
    console.error('[ipcrawl] /api/map/points failed:', err)
    return { markers: [], total: 0, truncated: false, zoom }
  }
})
