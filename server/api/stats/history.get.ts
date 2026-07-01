import type { StatsHistoryResponse, StatsSnapshotPoint } from '#shared/stats'
import { STATS_HISTORY_WINDOW_MS } from '#shared/stats'
import { getExploreDb } from '../../utils/exploreDb'
import { assertRateLimit, RATE_LIMIT_BINDINGS } from '../../utils/rateLimit'

const EMPTY: StatsHistoryResponse = { points: [], generatedAt: 0 }

// Per-isolate memo on top of the route-rule SWR. The refresh writes one
// snapshot per run (daily), so a 12-month window is ~365 points max —
// cheap to scan and ship, and only moves when a new snapshot lands, so an
// edge miss should never re-scan it twice in the same isolate.
const MEMO_TTL = 10 * 60 * 1000
let memo: { at: number, data: StatsHistoryResponse } | null = null

/**
 * Rolling 12-month catalogue-size series for the /stats "cameras over time"
 * chart. Highly cached: `/api/stats/history` route rule (long SWR) plus the
 * in-isolate memo above. One point per sync — no coarsening.
 */
export default defineEventHandler(async (event): Promise<StatsHistoryResponse> => {
  if (memo && Date.now() - memo.at < MEMO_TTL) return memo.data

  // Behind the SWR route rule and the memo — only true origin misses metered.
  await assertRateLimit(event, RATE_LIMIT_BINDINGS.api)

  try {
    const db = await getExploreDb(event)
    const since = Date.now() - STATS_HISTORY_WINDOW_MS
    const { results } = await db
      .prepare('SELECT ts, count, live FROM cam_count_snapshots WHERE ts >= ? ORDER BY ts ASC')
      .bind(since)
      .all<StatsSnapshotPoint>()

    const data: StatsHistoryResponse = {
      points: results.map((row: StatsSnapshotPoint) => ({
        ts: Number(row.ts) || 0,
        count: Number(row.count) || 0,
        live: Number(row.live) || 0
      })),
      generatedAt: Date.now()
    }

    memo = { at: Date.now(), data }
    return data
  } catch (err) {
    // Cold / unmigrated DB shouldn't 500 the stats page — degrade to empty so
    // the chart renders its own empty state. Never memoized.
    console.error('[ipcrawl] /api/stats/history failed:', err)
    return EMPTY
  }
})
