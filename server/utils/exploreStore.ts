import type { H3Event } from 'h3'
import type {
  ExploreCamCard,
  ExploreCamDetail,
  ExploreFacets,
  ExploreListResponse,
  ExploreQuery
} from '#shared/explore'
import {
  EXPLORE_FACET_LIMIT,
  EXPLORE_FACET_SEARCH_LIMIT,
  EXPLORE_MAX_FAVORITES,
  EXPLORE_SORT_RECENT,
  EXPLORE_SOURCE_LIVE
} from '#shared/explore'
import { apiExploreThumbPath, apiLiveFramePath } from '#shared/routes'
import type { CamMeta } from './camStore'
import { getExploreDb, type ExploreDb, type ExploreStatement } from './exploreDb'
import { isLiveProbeActive } from './liveProbeStatus'

/**
 * How long an unseen cam survives in the explorer before it's hard-deleted.
 * Wider than the 24h roulette archive: the explorer is a data product, so we
 * keep recently-vanished endpoints discoverable for a couple of months.
 */
const EXPLORE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000

// SQLite caps bound parameters at 100 per statement; each upsert binds 17, so
// 90 statements/batch stays comfortably under the per-batch ceiling while
// keeping round-trips low on the daily ingest.
const UPSERT_BATCH = 90

interface CamRow {
  id: string
  ip: string | null
  port: number | null
  country: string | null
  city: string | null
  org: string | null
  module: string | null
  manufacturer: string | null
  lat: number | null
  lon: number | null
  is_live: number
  live_checked_at: number | null
  first_seen_at: number | null
  last_seen_at: number | null
  fav_count?: number
}

/** Optional fresh probe state to fold into the camera upsert. */
export interface LiveReconcile {
  path: string | null
  at: number
}

function toEpochMs(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nullable<T>(value: T | undefined): T | null {
  return value === undefined ? null : value
}

function locationLabel(city: string | null, country: string | null): string | null {
  return [city, country].filter(Boolean).join(', ') || null
}

function rowToCard(row: CamRow): ExploreCamCard {
  return {
    id: row.id,
    country: row.country,
    city: row.city,
    org: row.org,
    manufacturer: row.manufacturer,
    location: locationLabel(row.city, row.country),
    isLive: row.is_live === 1,
    lat: typeof row.lat === 'number' ? row.lat : null,
    lon: typeof row.lon === 'number' ? row.lon : null,
    thumb: apiExploreThumbPath(row.id),
    lastSeenAt: row.last_seen_at,
    favCount: typeof row.fav_count === 'number' ? row.fav_count : 0
  }
}

// --- Page totals -------------------------------------------------------------
//
// We dropped `COUNT(*) OVER ()` from the grid query so the favorites sort can
// stop at the LIMIT instead of materializing every match. The total (for
// pagination) is recovered with a dedicated COUNT. The two hot, filter-free
// shapes — the default grid and the `source=live` grid — only change on the daily
// refresh (a vote never adds or removes a cam), so their counts are memoized
// in-process with a short TTL and dropped on ingest. Filtered queries fall
// back to a plain `COUNT(*)` (no window, no subquery) — far cheaper than the
// old correlated/windowed count and already shielded by the route SWR cache.
const TOTAL_CACHE_TTL_MS = 60_000
let totalAllCache: { at: number, n: number } | null = null
let totalLiveCache: { at: number, n: number } | null = null

function invalidateTotals(): void {
  totalAllCache = null
  totalLiveCache = null
}

function hasColumnFilters(query: ExploreQuery): boolean {
  return query.ids.length > 0
    || query.countries.length > 0
    || query.cities.length > 0
    || query.orgs.length > 0
    || query.manufacturers.length > 0
    || query.q.length > 0
}

async function countCams(
  db: ExploreDb,
  query: ExploreQuery,
  where: string,
  params: unknown[]
): Promise<number> {
  const cacheable = !hasColumnFilters(query)
  const now = Date.now()
  if (cacheable) {
    const hit = query.source === EXPLORE_SOURCE_LIVE ? totalLiveCache : totalAllCache
    if (hit && now - hit.at < TOTAL_CACHE_TTL_MS) return hit.n
  }
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM cams${where}`)
    .bind(...params)
    .first<{ n: number }>()
  const n = row?.n ?? 0
  if (cacheable) {
    if (query.source === EXPLORE_SOURCE_LIVE) totalLiveCache = { at: now, n }
    else totalAllCache = { at: now, n }
  }
  return n
}

function orderBy(query: ExploreQuery): string {
  if (query.sort === EXPLORE_SORT_RECENT) {
    return 'first_seen_at DESC, id'
  }
  return 'fav_count DESC, last_seen_at DESC, id'
}

const UPSERT_SQL = `INSERT INTO cams (
  id, ip, port, country, city, org, module, manufacturer, lat, lon, screenshot_mime,
  screenshot_hash, live_path, live_checked_at, is_live, first_seen_at, last_seen_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  ip = excluded.ip,
  port = excluded.port,
  country = excluded.country,
  city = excluded.city,
  org = excluded.org,
  module = excluded.module,
  manufacturer = excluded.manufacturer,
  lat = excluded.lat,
  lon = excluded.lon,
  screenshot_mime = excluded.screenshot_mime,
  screenshot_hash = COALESCE(excluded.screenshot_hash, cams.screenshot_hash),
  first_seen_at = MIN(cams.first_seen_at, excluded.first_seen_at),
  last_seen_at = excluded.last_seen_at,
  live_checked_at = COALESCE(excluded.live_checked_at, cams.live_checked_at),
  live_path = CASE WHEN excluded.live_checked_at IS NOT NULL
    THEN excluded.live_path ELSE cams.live_path END,
  is_live = CASE WHEN excluded.live_checked_at IS NOT NULL
    THEN excluded.is_live ELSE cams.is_live END`

/**
 * Batch-upsert the freshly-ingested cam set into the DB. `firstSeenAt` is preserved
 * as the earliest of (existing, incoming); live state is only overwritten for
 * cams we have fresh probe info for (see the CASE/COALESCE in UPSERT_SQL), so
 * cams without fresh probe data keep whatever liveness they had.
 */
export async function upsertCams(
  cams: CamMeta[],
  live: Map<string, LiveReconcile>,
  now: number,
  event?: H3Event
): Promise<number> {
  if (cams.length === 0) return 0
  const db = await getExploreDb(event)

  let written = 0
  for (let i = 0; i < cams.length; i += UPSERT_BATCH) {
    const slice = cams.slice(i, i + UPSERT_BATCH)
    const statements: ExploreStatement[] = slice.map((cam) => {
      const probe = live.get(cam.id)
      const isLive = probe ? (probe.path ? 1 : 0) : 0
      const livePath = probe ? probe.path : null
      const liveCheckedAt = probe ? probe.at : null
      return db.prepare(UPSERT_SQL).bind(
        cam.id,
        cam.ip,
        cam.port,
        nullable(cam.country),
        nullable(cam.city),
        nullable(cam.org),
        nullable(cam.module),
        nullable(cam.manufacturer),
        nullable(cam.lat),
        nullable(cam.lon),
        cam.screenshotMime,
        nullable(cam.screenshotHash),
        livePath,
        liveCheckedAt,
        isLive,
        toEpochMs(cam.firstSeenAt, now),
        toEpochMs(cam.lastSeenAt, now)
      )
    })
    await db.batch(statements)
    written += slice.length
  }
  // The catalogue changed — drop the cached page totals (the live/all counts).
  invalidateTotals()
  return written
}

/** Hard-delete cams not seen within the retention window. Returns nothing. */
export async function pruneCams(now: number, event?: H3Event): Promise<void> {
  const db = await getExploreDb(event)
  const cutoff = now - EXPLORE_RETENTION_MS
  // Drop favorites for the cams about to be pruned first: keeps cam_favorites
  // from accumulating dead cam_ids forever, and means a long-vanished cam that
  // later reappears starts from a clean (correct) denormalized fav_count rather
  // than inheriting stale votes the now-zeroed column no longer reflects.
  await db
    .prepare('DELETE FROM cam_favorites WHERE cam_id IN (SELECT id FROM cams WHERE last_seen_at < ?)')
    .bind(cutoff)
    .run()
  await db.prepare('DELETE FROM cams WHERE last_seen_at < ?').bind(cutoff).run()
  invalidateTotals()
}

type FacetColumn = 'country' | 'city' | 'org' | 'manufacturer'

/**
 * Build the WHERE clause shared by the list query and the facet counts.
 * `skip` omits one dimension's own IN-filter — used by the facet endpoint so
 * each dropdown is narrowed by the *other* active filters (e.g. cities are
 * limited to the selected countries) while still listing every value within
 * its own dimension, which is what lets you multi-select inside a facet.
 */
export function buildFilters(
  query: ExploreQuery,
  opts: { skip?: FacetColumn } = {}
): { sql: string, params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  if (query.source === EXPLORE_SOURCE_LIVE) clauses.push('is_live = 1')

  // Favorites view: restrict to an explicit id allow-list. Capped to
  // MAX_FILTER_VALUES upstream like every other multi-value filter.
  if (query.ids.length > 0) {
    clauses.push(`id IN (${query.ids.map(() => '?').join(',')})`)
    params.push(...query.ids)
  }

  const addIn = (col: FacetColumn, values: string[]) => {
    if (opts.skip === col || values.length === 0) return
    clauses.push(`${col} IN (${values.map(() => '?').join(',')})`)
    params.push(...values)
  }
  addIn('country', query.countries)
  addIn('city', query.cities)
  addIn('org', query.orgs)
  addIn('manufacturer', query.manufacturers)

  if (query.q) {
    clauses.push('(country LIKE ? OR city LIKE ? OR org LIKE ? OR manufacturer LIKE ?)')
    const like = `%${query.q}%`
    params.push(like, like, like, like)
  }

  return {
    sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
    params
  }
}

/** Paginated, filtered grid query. Ordered newest-seen first for stable pages. */
export async function queryCams(
  query: ExploreQuery,
  event?: H3Event
): Promise<ExploreListResponse> {
  const db = await getExploreDb(event)
  const { sql: where, params } = buildFilters(query)

  const offset = Math.max(0, (query.page - 1) * query.pageSize)
  // No `COUNT(*) OVER ()` and no correlated fav_count subquery: together they
  // forced a full scan of every match (plus a cam_favorites scan per row) on
  // every page — the single worst rows-read offender. `fav_count` is now a
  // denormalized column kept current by setFavorite, so `ORDER BY fav_count
  // DESC, …` is served straight off idx_cams_fav / idx_cams_live_fav and stops
  // at the page boundary. The total is recovered by `countCams` (cached for the
  // filter-free shapes).
  const rows = await db
    .prepare(
      `SELECT id, country, city, org, manufacturer, lat, lon, is_live, last_seen_at, fav_count
       FROM cams${where}
       ORDER BY ${orderBy(query)}
       LIMIT ? OFFSET ?`
    )
    .bind(...params, query.pageSize, offset)
    .all<CamRow>()

  const total = await countCams(db, query, where, params)

  return {
    items: rows.results.map(rowToCard),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
}

async function facetFor(
  db: ExploreDb,
  column: FacetColumn,
  query: ExploreQuery
): Promise<{ value: string, count: number }[]> {
  // Narrow by every active filter except this column's own selection.
  const { sql: where, params } = buildFilters(query, { skip: column })
  const notNull = `${column} IS NOT NULL AND ${column} != ''`
  const fullWhere = where ? `${where} AND ${notNull}` : ` WHERE ${notNull}`

  const rows = await db
    .prepare(
      `SELECT ${column} AS value, COUNT(*) AS count
       FROM cams${fullWhere}
       GROUP BY ${column}
       ORDER BY count DESC, value ASC
       LIMIT ?`
    )
    .bind(...params, EXPLORE_FACET_LIMIT)
    .all<{ value: string, count: number }>()
  return rows.results
}

/**
 * Typeahead search for one facet dimension. Cross-filtered like `getFacets`, but
 * narrows values with a case-insensitive substring match on the searched column.
 */
export async function searchFacet(
  column: FacetColumn,
  term: string,
  query: ExploreQuery,
  event?: H3Event
): Promise<{ value: string, count: number }[]> {
  const db = await getExploreDb(event)
  const { sql: where, params } = buildFilters(query, { skip: column })
  const notNull = `${column} IS NOT NULL AND ${column} != ''`
  const clauses = [notNull, `${column} LIKE ? ESCAPE '\\'`]
  const searchParams = [...params, `%${term.replace(/[%_\\]/g, m => `\\${m}`)}%`]
  const fullWhere = where
    ? `${where} AND ${clauses.join(' AND ')}`
    : ` WHERE ${clauses.join(' AND ')}`

  const rows = await db
    .prepare(
      `SELECT ${column} AS value, COUNT(*) AS count
       FROM cams${fullWhere}
       GROUP BY ${column}
       ORDER BY count DESC, value ASC
       LIMIT ?`
    )
    .bind(...searchParams, EXPLORE_FACET_SEARCH_LIMIT)
    .all<{ value: string, count: number }>()
  return rows.results
}

/**
 * Distinct country / city / org / manufacturer options with counts for the
 * sidebar, each cross-filtered by the other active selections (so picking a
 * country trims the city/org/manufacturer lists to that country, etc.).
 */
export async function getFacets(
  query: ExploreQuery,
  event?: H3Event
): Promise<ExploreFacets> {
  const db = await getExploreDb(event)
  const [countries, cities, orgs, manufacturers] = await Promise.all([
    facetFor(db, 'country', query),
    facetFor(db, 'city', query),
    facetFor(db, 'org', query),
    facetFor(db, 'manufacturer', query)
  ])
  return { countries, cities, orgs, manufacturers }
}

interface DetailRow extends CamRow {
  screenshot_mime: string | null
}

/** Full row for the single-cam dialog. */
export async function getCamDetail(
  id: string,
  event?: H3Event
): Promise<ExploreCamDetail | null> {
  const db = await getExploreDb(event)
  const row = await db
    .prepare(
      `SELECT id, port, country, city, org, module, manufacturer, lat, lon,
              is_live, live_checked_at, first_seen_at, last_seen_at, screenshot_mime,
              fav_count
       FROM cams WHERE id = ?`
    )
    .bind(id)
    .first<DetailRow>()
  if (!row) return null

  // Deliberately omit `ip` — see ExploreCamDetail docs.
  return {
    ...rowToCard(row),
    port: row.port,
    module: row.module,
    firstSeenAt: row.first_seen_at,
    liveCheckedAt: row.live_checked_at,
    liveProbeActive: await isLiveProbeActive(row),
    live: apiLiveFramePath(row.id)
  }
}

export type SetFavoriteResult
  = | { ok: true, count: number }
    | { ok: false, reason: 'not_found' | 'over_cap' }

/**
 * Record or withdraw one anonymized favorite vote. Anti-cheat is structural:
 * the (cam_id, voter_hash) PK makes repeat votes idempotent, the cam must
 * actually exist (no inflating arbitrary ids), and a voter is capped at
 * EXPLORE_MAX_FAVORITES rows total — mirroring the client cookie cap.
 */
export async function setFavorite(
  camId: string,
  voterHash: string,
  on: boolean,
  now: number,
  event?: H3Event
): Promise<SetFavoriteResult> {
  const db = await getExploreDb(event)

  const exists = await db.prepare('SELECT 1 AS x FROM cams WHERE id = ?').bind(camId).first()
  if (!exists) return { ok: false, reason: 'not_found' }

  if (on) {
    const mine = await db
      .prepare('SELECT COUNT(*) AS n FROM cam_favorites WHERE voter_hash = ?')
      .bind(voterHash)
      .first<{ n: number }>()
    if ((mine?.n ?? 0) >= EXPLORE_MAX_FAVORITES) return { ok: false, reason: 'over_cap' }

    await db
      .prepare('INSERT OR IGNORE INTO cam_favorites (cam_id, voter_hash, created_at) VALUES (?,?,?)')
      .bind(camId, voterHash, now)
      .run()
  } else {
    await db
      .prepare('DELETE FROM cam_favorites WHERE cam_id = ? AND voter_hash = ?')
      .bind(camId, voterHash)
      .run()
  }

  // Recompute this one cam's tally from the source of truth and write it back to
  // the denormalized `cams.fav_count` (cheap: cam_favorites is PK-indexed by
  // cam_id). RETURNING hands back the fresh count in the same round trip. The
  // recompute is idempotent, so concurrent votes converge on the true count
  // without an explicit transaction. Vote counts don't change row totals, so
  // the pagination caches in `countCams` are intentionally left untouched.
  const updated = await db
    .prepare(
      `UPDATE cams
       SET fav_count = (SELECT COUNT(*) FROM cam_favorites WHERE cam_id = ?)
       WHERE id = ?
       RETURNING fav_count`
    )
    .bind(camId, camId)
    .first<{ fav_count: number }>()
  return { ok: true, count: updated?.fav_count ?? 0 }
}

/** Look up just the screenshot mime for a cam (thumbnail route fallback). */
export async function getCamScreenshotMime(
  id: string,
  event?: H3Event
): Promise<string | null> {
  const db = await getExploreDb(event)
  return db
    .prepare('SELECT screenshot_mime FROM cams WHERE id = ?')
    .bind(id)
    .first<string>('screenshot_mime')
}
