import type { H3Event } from 'h3'
import type { MapMarker, MapQuery, MapResponse } from '#shared/map'
import { mapCellDeg, MAP_MAX_CELLS, MAP_STACK_ZOOM } from '#shared/map'
import type { ExploreQuery } from '#shared/explore'
import { apiExploreThumbPath } from '#shared/routes'
import { getExploreDb } from '~~/server/utils/exploreDb'
import { buildFilters } from '~~/server/utils/exploreStore'

interface CellRow {
  cnt: number
  lat: number
  lon: number
  min_lat: number
  max_lat: number
  min_lon: number
  max_lon: number
  sample_id: string
  any_live: number
}

interface PinRow {
  id: string
  lat: number
  lon: number
  is_live: number
  total_count: number
}

/**
 * Level-of-detail viewport query for the map. Cameras are snapped into a
 * fixed-degree grid (cell size derived from zoom) and each cell is collapsed to
 * a single marker *in SQL*, so dense regions never ship per-camera rows to the
 * client. Two things keep this off the D1 bill:
 *
 *  1. The bbox `WHERE` is backed by the covering idx_cams_geo
 *     (lat, lon, is_live, id), so the aggregate touches only on-screen rows and
 *     resolves index-only — no per-row table lookup.
 *  2. The caller snaps the bbox to cell boundaries, so the route-rule SWR cache
 *     collapses every in-cell pan into one origin read.
 *
 * `AVG(lat/lon)` is the cell centroid (the exact point for a singleton);
 * `MIN(id)` names the singleton's cam (irrelevant once `cnt > 1`).
 */
export async function queryMapClusters(
  query: MapQuery,
  event?: H3Event
): Promise<MapResponse> {
  const db = await getExploreDb(event)
  const cell = mapCellDeg(query.zoom)

  // Reuse the catalogue's exact filter semantics (source/country/city/org/q).
  // The map has no favorites allow-list, so `ids` is empty; the map UI doesn't
  // expose a manufacturer filter, so `manufacturers` is empty; page/sort are
  // unused by buildFilters.
  const exploreShape: ExploreQuery = {
    page: 1,
    pageSize: 1,
    sort: 'recent',
    source: query.source,
    countries: query.countries,
    cities: query.cities,
    orgs: query.orgs,
    manufacturers: [],
    ids: [],
    q: query.q
  }
  const { sql: filterSql, params: filterParams } = buildFilters(exploreShape)

  const geo = `lat IS NOT NULL AND lon IS NOT NULL
    AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`
  const where = filterSql ? `${filterSql} AND ${geo}` : ` WHERE ${geo}`
  const geoParams = [query.bounds.s, query.bounds.n, query.bounds.w, query.bounds.e]

  // Below MAP_STACK_ZOOM we aggregate into grid cells for visual summarization
  // (one marker per cell: either a singleton thumb or a count cluster). At/above
  // the stack threshold we switch to raw per-camera pins so that exact (lat,lon)
  // overlaps — typical of IP geolocation — become visible to the client as
  // "N cameras here" stack pins that open a member picker. This reveals stacks
  // without forcing the user all the way to MAP_MAX_ZOOM.
  if (query.zoom >= MAP_STACK_ZOOM) {
    return queryMapPins(db, where, [...filterParams, ...geoParams], query.zoom)
  }

  // +1 over the cap so we can detect (and flag) truncation. ORDER BY cnt DESC
  // means if we ever do truncate we keep the densest cells (the ones most worth
  // showing) rather than dropping them for scattered singletons.
  const sql = `
    SELECT COUNT(*) AS cnt,
           AVG(lat) AS lat,
           AVG(lon) AS lon,
           MIN(lat) AS min_lat,
           MAX(lat) AS max_lat,
           MIN(lon) AS min_lon,
           MAX(lon) AS max_lon,
           MIN(id) AS sample_id,
           MAX(is_live) AS any_live
    FROM cams${where}
    GROUP BY CAST((lat + 90) / ? AS INTEGER), CAST((lon + 180) / ? AS INTEGER)
    ORDER BY cnt DESC
    LIMIT ?`

  const rows = await db
    .prepare(sql)
    .bind(...filterParams, ...geoParams, cell, cell, MAP_MAX_CELLS + 1)
    .all<CellRow>()

  const truncated = rows.results.length > MAP_MAX_CELLS
  const cells = truncated ? rows.results.slice(0, MAP_MAX_CELLS) : rows.results

  let total = 0
  const markers: MapMarker[] = cells.map((row) => {
    const count = Number(row.cnt) || 0
    total += count
    const single = count === 1
    return {
      lat: row.lat,
      lon: row.lon,
      count,
      id: single ? row.sample_id : null,
      live: Number(row.any_live) === 1,
      thumb: single ? apiExploreThumbPath(row.sample_id) : null,
      minLat: row.min_lat,
      maxLat: row.max_lat,
      minLon: row.min_lon,
      maxLon: row.max_lon
    }
  })

  return { markers, total, truncated, zoom: query.zoom }
}

/**
 * Max-zoom feed: individual cameras (no grid clustering) for the current bbox.
 * Each row becomes a singleton marker carrying its id + thumb, so the client
 * can render a clickable pin — and fold cameras sharing a coordinate into one
 * "stack" marker that opens a picker. `COUNT(*) OVER ()` reports the true bbox
 * total even when the row set is capped.
 */
async function queryMapPins(
  db: Awaited<ReturnType<typeof getExploreDb>>,
  where: string,
  params: unknown[],
  zoom: number
): Promise<MapResponse> {
  const rows = await db
    .prepare(
      `SELECT id, lat, lon, is_live, COUNT(*) OVER () AS total_count
       FROM cams${where}
       ORDER BY last_seen_at DESC
       LIMIT ?`
    )
    .bind(...params, MAP_MAX_CELLS + 1)
    .all<PinRow>()

  const truncated = rows.results.length > MAP_MAX_CELLS
  const pins = truncated ? rows.results.slice(0, MAP_MAX_CELLS) : rows.results
  const total = rows.results[0]?.total_count ?? 0

  const markers: MapMarker[] = pins.map(row => ({
    lat: row.lat,
    lon: row.lon,
    count: 1,
    id: row.id,
    live: Number(row.is_live) === 1,
    thumb: apiExploreThumbPath(row.id),
    minLat: row.lat,
    maxLat: row.lat,
    minLon: row.lon,
    maxLon: row.lon
  }))

  return { markers, total, truncated, zoom }
}
