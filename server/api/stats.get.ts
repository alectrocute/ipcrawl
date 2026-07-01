import type { StatsBucket, StatsResponse } from '#shared/stats'
import { STATS_BUCKET_LIMIT } from '#shared/stats'
import type { ExploreDb } from '../utils/exploreDb'
import { getExploreDb } from '../utils/exploreDb'
import { assertRateLimit, RATE_LIMIT_BINDINGS } from '../utils/rateLimit'

// Fixed allow-list of GROUP BY columns — the column name is interpolated into
// SQL, so it must never come from the request.
const BREAKDOWNS = [
  ['countries', 'country'],
  ['orgs', 'org'],
  ['manufacturers', 'manufacturer']
] as const

interface TotalsRow {
  cams: number
  live: number
  countries: number
  orgs: number
  manufacturers: number
}

interface BucketRow {
  value: string | number
  count: number
  live: number | null
}

const EMPTY: StatsResponse = {
  totals: { cams: 0, live: 0, countries: 0, orgs: 0, manufacturers: 0 },
  countries: [],
  orgs: [],
  manufacturers: [],
  generatedAt: 0
}

async function loadBuckets(db: ExploreDb, column: string): Promise<StatsBucket[]> {
  const { results } = await db.prepare(
    `SELECT ${column} AS value, COUNT(*) AS count, COALESCE(SUM(is_live), 0) AS live
     FROM cams
     WHERE ${column} IS NOT NULL AND ${column} != ''
     GROUP BY ${column}
     ORDER BY count DESC, value ASC
     LIMIT ?`
  ).bind(STATS_BUCKET_LIMIT).all<BucketRow>()
  return results.map(row => ({
    value: String(row.value),
    count: Number(row.count) || 0,
    live: Number(row.live) || 0
  }))
}

// Per-isolate memo on top of the route-rule SWR: the underlying data only
// moves on the daily Shodan refresh, so even an edge-cache miss should
// almost never pay for the three GROUP BY scans twice in the same isolate.
const MEMO_TTL = 10 * 60 * 1000
let memo: { at: number, data: StatsResponse } | null = null

/**
 * Aggregate catalogue stats (totals + top-N breakdowns by country / org /
 * manufacturer) for the /stats charts. Highly cached: `/api/stats` route
 * rule (long SWR), plus the in-isolate memo above. Raw IPs are never touched —
 * everything here is a COUNT over already-public facet columns.
 */
export default defineEventHandler(async (event): Promise<StatsResponse> => {
  if (memo && Date.now() - memo.at < MEMO_TTL) return memo.data

  // Behind the SWR route rule and the memo — only true origin misses metered.
  await assertRateLimit(event, RATE_LIMIT_BINDINGS.api)

  try {
    const db = await getExploreDb(event)

    const totalsPromise = db.prepare(
      `SELECT
         COUNT(*) AS cams,
         COALESCE(SUM(is_live), 0) AS live,
         COUNT(DISTINCT country) AS countries,
         COUNT(DISTINCT org) AS orgs,
         COUNT(DISTINCT manufacturer) AS manufacturers
       FROM cams`
    ).first<TotalsRow>()

    const [totals, ...buckets] = await Promise.all([
      totalsPromise,
      ...BREAKDOWNS.map(([, column]) => loadBuckets(db, column))
    ])

    const data: StatsResponse = {
      totals: {
        cams: Number(totals?.cams) || 0,
        live: Number(totals?.live) || 0,
        countries: Number(totals?.countries) || 0,
        orgs: Number(totals?.orgs) || 0,
        manufacturers: Number(totals?.manufacturers) || 0
      },
      countries: buckets[0] ?? [],
      orgs: buckets[1] ?? [],
      manufacturers: buckets[2] ?? [],
      generatedAt: Date.now()
    }

    memo = { at: Date.now(), data }
    return data
  } catch (err) {
    // A cold / unmigrated DB shouldn't 500 the stats page — degrade to zeros
    // so the page renders its empty state. Never memoized.
    console.error('[ipcrawl] /api/stats failed:', err)
    return EMPTY
  }
})
