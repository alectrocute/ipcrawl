import type { Cam } from './shodan'
import { getExploreDb, type ExploreDb } from './exploreDb'

/**
 * Cam metadata — everything *except* the screenshot binary. The binary lives
 * in the `screenshots` storage namespace keyed by `${id}.<ext>`.
 */
export type CamMeta = Omit<Cam, 'screenshot'> & {
  screenshotMime: string
  /**
   * SHA-256 of the Shodan screenshot base64 from the last refresh. Lets the
   * next refresh skip the write when the still hasn't changed (the common
   * case — Shodan recrawls hosts far less often than we refresh).
   */
  screenshotHash?: string
  firstSeenAt?: string
  lastSeenAt?: string
}

export interface CamRefreshMeta {
  refreshedAt: string
  count: number
  blocked: number
  queries: string[]
  errors: { query: string, error: string }[]
}

export interface LiveProbeCacheEntry {
  path: string | null
  at: number
}

interface CamRow {
  id: string
  ip: string
  port: number
  country: string | null
  city: string | null
  org: string | null
  module: string | null
  manufacturer: string | null
  lat: number | null
  lon: number | null
  screenshot_mime: string
  screenshot_hash: string | null
  first_seen_at: number
  last_seen_at: number
}

interface RefreshMetaRow {
  refreshed_at: string
  count: number
  blocked: number
  queries_json: string
  errors_json: string
}

// In-process cache for the active cam list / retained archive. `findCam` runs
// on every /api/live poll, and without this each poll would re-read the DB.
// The active list only changes on the daily refresh, so a short TTL eliminates
// most hot-path reads.
const LIST_CACHE_TTL_MS = 60_000

interface CachedCamList {
  at: number
  cams: CamMeta[]
  byId: Map<string, CamMeta>
}

let listCache: CachedCamList | null = null
let archiveCache: CachedCamList | null = null

// Per-id cache for `findCam`'s single-row fallback so each poll doesn't
// issue a fresh DB single-row read. Same staleness budget as the list caches.
const MAX_ID_CACHE = 512
const idCache = new Map<string, { at: number, cam: CamMeta }>()

// Cached count of the active list so the per-id payload routes don't hydrate
// the entire list just to report a total.
let activeCountCache: { at: number, n: number } | null = null

function toCache(cams: CamMeta[]): CachedCamList {
  return {
    at: Date.now(),
    cams,
    byId: new Map(cams.map(c => [c.id, c]))
  }
}

function cacheById(cam: CamMeta): void {
  idCache.delete(cam.id)
  if (idCache.size >= MAX_ID_CACHE) {
    const oldest = idCache.keys().next().value
    if (oldest !== undefined) idCache.delete(oldest)
  }
  idCache.set(cam.id, { at: Date.now(), cam })
}

// Invalidate the derived caches whenever the list/archive snapshot changes.
function clearDerivedCaches(): void {
  idCache.clear()
  activeCountCache = null
}

function extFor(mime: string): string {
  if (mime === 'image/png') return 'png'
  return 'jpg'
}

function screenshotKey(id: string, mime: string): string {
  return `${id}.${extFor(mime)}`
}

function epochToIso(value: number | null): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return new Date(value).toISOString()
}

function rowToMeta(row: CamRow): CamMeta {
  return {
    id: row.id,
    ip: row.ip,
    port: row.port,
    country: row.country ?? undefined,
    city: row.city ?? undefined,
    org: row.org ?? undefined,
    lat: row.lat ?? undefined,
    lon: row.lon ?? undefined,
    module: row.module ?? undefined,
    manufacturer: row.manufacturer ?? undefined,
    screenshotMime: row.screenshot_mime,
    screenshotHash: row.screenshot_hash ?? undefined,
    firstSeenAt: epochToIso(row.first_seen_at),
    lastSeenAt: epochToIso(row.last_seen_at)
  }
}

async function queryCamRows(sql: string, ...params: unknown[]): Promise<CamMeta[]> {
  const db = await getExploreDb()
  const rows = await db.prepare(sql).bind(...params).all<CamRow>()
  return rows.results.map(rowToMeta)
}

async function activeList(db?: ExploreDb): Promise<CamMeta[]> {
  const handle = db ?? await getExploreDb()
  const rows = await handle
    .prepare(
      `SELECT id, ip, port, country, city, org, module, manufacturer, lat, lon,
              screenshot_mime, screenshot_hash, first_seen_at, last_seen_at
       FROM cams
       WHERE last_seen_at = (SELECT MAX(last_seen_at) FROM cams)
       ORDER BY id`
    )
    .all<CamRow>()
  return rows.results.map(rowToMeta)
}

export async function listCams(): Promise<CamMeta[]> {
  if (listCache && Date.now() - listCache.at < LIST_CACHE_TTL_MS) return listCache.cams
  const cams = await activeList()
  listCache = toCache(cams)
  return cams
}

/**
 * Number of cams in the active list. Reuses the warm list cache when present;
 * otherwise a `COUNT(*)` round trip (and its own short cache) instead of
 * loading every row just to read `.length`.
 */
export async function countActiveCams(): Promise<number> {
  if (listCache && Date.now() - listCache.at < LIST_CACHE_TTL_MS) {
    return listCache.cams.length
  }
  if (activeCountCache && Date.now() - activeCountCache.at < LIST_CACHE_TTL_MS) {
    return activeCountCache.n
  }
  const db = await getExploreDb()
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM cams WHERE last_seen_at = (SELECT MAX(last_seen_at) FROM cams)')
    .first<{ n: number }>()
  const n = row?.n ?? 0
  activeCountCache = { at: Date.now(), n }
  return n
}

export async function listArchivedCams(): Promise<CamMeta[]> {
  if (archiveCache && Date.now() - archiveCache.at < LIST_CACHE_TTL_MS) return archiveCache.cams
  const cams = await queryCamRows(
    `SELECT id, ip, port, country, city, org, module, manufacturer, lat, lon,
            screenshot_mime, screenshot_hash, first_seen_at, last_seen_at
     FROM cams
     ORDER BY last_seen_at DESC, id`
  )
  archiveCache = toCache(cams)
  return cams
}

export async function findCam(id: string): Promise<CamMeta | null> {
  if (listCache && Date.now() - listCache.at < LIST_CACHE_TTL_MS) {
    const cam = listCache.byId.get(id)
    if (cam) return cam
  }
  if (archiveCache && Date.now() - archiveCache.at < LIST_CACHE_TTL_MS) {
    const cam = archiveCache.byId.get(id)
    if (cam) return cam
  }
  const cached = idCache.get(id)
  if (cached && Date.now() - cached.at < LIST_CACHE_TTL_MS) return cached.cam

  const rows = await queryCamRows(
    `SELECT id, ip, port, country, city, org, module, manufacturer, lat, lon,
            screenshot_mime, screenshot_hash, first_seen_at, last_seen_at
     FROM cams
     WHERE id = ?
     LIMIT 1`,
    id
  )
  const cam = rows[0] ?? null
  if (cam) cacheById(cam)
  return cam
}

export async function writeCamList(metas: CamMeta[]): Promise<void> {
  listCache = toCache(metas)
  clearDerivedCaches()
}

export async function writeCamArchive(metas: CamMeta[]): Promise<void> {
  archiveCache = toCache(metas)
  clearDerivedCaches()
}

export async function deleteCams(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getExploreDb()
  const batchSize = 90
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize)
    await db
      .prepare(`DELETE FROM cams WHERE id IN (${slice.map(() => '?').join(',')})`)
      .bind(...slice)
      .run()
  }
  listCache = null
  archiveCache = null
  clearDerivedCaches()
}

export async function writeMeta(meta: CamRefreshMeta): Promise<void> {
  const db = await getExploreDb()
  await db
    .prepare(
      `INSERT INTO cam_refresh_meta (
         id, refreshed_at, count, blocked, queries_json, errors_json
       ) VALUES ('latest', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         refreshed_at = excluded.refreshed_at,
         count = excluded.count,
         blocked = excluded.blocked,
         queries_json = excluded.queries_json,
         errors_json = excluded.errors_json`
    )
    .bind(
      meta.refreshedAt,
      meta.count,
      meta.blocked,
      JSON.stringify(meta.queries),
      JSON.stringify(meta.errors)
    )
    .run()
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

export async function readMeta(): Promise<CamRefreshMeta | null> {
  const db = await getExploreDb()
  const row = await db
    .prepare(
      `SELECT refreshed_at, count, blocked, queries_json, errors_json
       FROM cam_refresh_meta
       WHERE id = 'latest'`
    )
    .first<RefreshMetaRow>()
  if (!row) return null
  return {
    refreshedAt: row.refreshed_at,
    count: row.count,
    blocked: row.blocked,
    queries: parseJsonArray<string>(row.queries_json),
    errors: parseJsonArray<{ query: string, error: string }>(row.errors_json)
  }
}

export async function readLiveProbeCache(id: string): Promise<LiveProbeCacheEntry | null> {
  const db = await getExploreDb()
  const row = await db
    .prepare('SELECT live_path, live_checked_at FROM cams WHERE id = ?')
    .bind(id)
    .first<{ live_path: string | null, live_checked_at: number | null }>()
  if (!row || typeof row.live_checked_at !== 'number') return null
  return { path: row.live_path, at: row.live_checked_at }
}

export async function writeLiveProbeCache(id: string, path: string | null): Promise<void> {
  const at = Date.now()
  const db = await getExploreDb()
  await db
    .prepare(
      `UPDATE cams
       SET live_path = ?, live_checked_at = ?, is_live = ?
       WHERE id = ?`
    )
    .bind(path, at, path ? 1 : 0, id)
    .run()
}

export async function getScreenshotBytes(cam: CamMeta): Promise<Uint8Array | null> {
  const storage = useStorage('screenshots')
  // getItemRaw returns a Uint8Array (or Buffer in Node) consistently.
  const raw = await storage.getItemRaw<Uint8Array | ArrayBuffer | null>(
    screenshotKey(cam.id, cam.screenshotMime)
  )
  if (!raw) return null
  if (raw instanceof Uint8Array) return raw
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw)
  // Node Buffer is also a Uint8Array, so the first branch usually catches it.
  return new Uint8Array(raw as ArrayBufferLike)
}

export async function writeScreenshot(
  id: string,
  mime: string,
  base64: string
): Promise<void> {
  // Decode base64 to bytes.
  await writeScreenshotBytes(id, mime, base64ToBytes(base64))
}

/**
 * Write raw screenshot bytes for a cam. Used by both the scheduled Shodan
 * refresh (which decodes from base64) and the live-probe write-through (which
 * already has bytes in hand). Persisting live frames means a viewer who
 * triggers a successful upstream fetch raises the floor for every other viewer
 * looking at the same cam — they'll see the refreshed frame on their next
 * Shodan-fallback read instead of the stale scheduled still.
 */
export async function writeScreenshotBytes(
  id: string,
  mime: string,
  bytes: Uint8Array
): Promise<void> {
  const storage = useStorage('screenshots')
  await storage.setItemRaw(screenshotKey(id, mime), bytes)
}

function base64ToBytes(b64: string): Uint8Array {
  const buffer = (globalThis as typeof globalThis & {
    Buffer?: { from(input: string, encoding: 'base64'): Uint8Array }
  }).Buffer
  if (buffer) {
    return new Uint8Array(buffer.from(b64, 'base64'))
  }
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
