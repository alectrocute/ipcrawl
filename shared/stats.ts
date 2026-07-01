// Shared contract for the /stats page. Imported from both the Nitro API route
// (server) and the stats page/components via the `#shared/stats` alias, so the
// wire shape can never drift between the two ends.

/** One aggregated slice (a country, org or manufacturer) of the catalogue. */
export interface StatsBucket {
  value: string
  count: number
  /** How many cams in this slice currently have a working live snapshot. */
  live: number
}

export interface StatsTotals {
  cams: number
  live: number
  countries: number
  orgs: number
  manufacturers: number
}

export interface StatsResponse {
  totals: StatsTotals
  countries: StatsBucket[]
  orgs: StatsBucket[]
  manufacturers: StatsBucket[]
  /** Epoch ms when this aggregate was computed (not when it was served). */
  generatedAt: number
}

/** Top-N cap per breakdown — enough for a chart, small enough to cache hard. */
export const STATS_BUCKET_LIMIT = 12

/** One point in the rolling "cameras over time" series on /stats. */
export interface StatsSnapshotPoint {
  /** Epoch ms when the snapshot was captured. */
  ts: number
  /** Total catalogue size at that moment. */
  count: number
  /** How many of those had a confirmed live snapshot at that moment. */
  live: number
}

export interface StatsHistoryResponse {
  /** Nearest-first snapshots inside the rolling window (oldest → newest). */
  points: StatsSnapshotPoint[]
  /** Epoch ms when this series was assembled (not when it was served). */
  generatedAt: number
}

/** Length of the rolling window returned by `/api/stats/history`, in ms. */
export const STATS_HISTORY_WINDOW_MS = 365 * 24 * 60 * 60 * 1000
