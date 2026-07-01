import type { H3Event } from 'h3'
import type { StatsSnapshotPoint } from '#shared/stats'
import { STATS_HISTORY_WINDOW_MS } from '#shared/stats'
import { getExploreDb } from './exploreDb'

/**
 * Durable record of the catalogue's total size at a point in time. The `cams`
 * table itself hard-deletes rows after a 60-day retention window (pruneCams),
 * so without these snapshots the 12-month "cameras over time" chart on /stats
 * couldn't be reconstructed from the live DB. One row per refresh run, written
 * after the upsert so the count reflects the new catalogue.
 */

interface CountRow {
  cams: number
  live: number | null
}

/**
 * Read the current catalogue totals in one query. Mirrors the totals scan in
 * `server/api/stats.get.ts` but pulled out so the refresh task can reuse it
 * without going through the route handler.
 */
export async function readCamCounts(event?: H3Event): Promise<{ count: number, live: number }> {
  const db = await getExploreDb(event)
  const row = await db.prepare(
    `SELECT COUNT(*) AS cams, COALESCE(SUM(is_live), 0) AS live FROM cams`
  ).first<CountRow>()
  return {
    count: Number(row?.cams) || 0,
    live: Number(row?.live) || 0
  }
}

/**
 * Persist a snapshot row at `ts` (epoch ms). `ts` is the PK so a re-run at the
 * same millisecond idempotently overwrites. Best-effort: a failure here only
 * costs us one historical point, never the refresh itself, so the caller should
 * swallow errors rather than fail the run.
 */
export async function writeCamCountSnapshot(
  ts: number,
  count: number,
  live: number,
  event?: H3Event
): Promise<void> {
  const db = await getExploreDb(event)
  await db
    .prepare('INSERT OR REPLACE INTO cam_count_snapshots (ts, count, live) VALUES (?, ?, ?)')
    .bind(ts, count, live)
    .run()
}

/**
 * Read the snapshots inside the rolling window (oldest → newest). Used by the
 * /stats chart. Coarsened to ~one point per day below — see API route.
 */
export async function readCamCountHistory(
  sinceMs: number = Date.now() - STATS_HISTORY_WINDOW_MS,
  event?: H3Event
): Promise<StatsSnapshotPoint[]> {
  const db = await getExploreDb(event)
  const { results } = await db
    .prepare('SELECT ts, count, live FROM cam_count_snapshots WHERE ts >= ? ORDER BY ts ASC')
    .bind(sinceMs)
    .all<StatsSnapshotPoint>()
  return results.map(row => ({
    ts: Number(row.ts) || 0,
    count: Number(row.count) || 0,
    live: Number(row.live) || 0
  }))
}
