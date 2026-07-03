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

/** VPS-level memory snapshot for the /stats "Crawler status" panel. */
export interface SystemStatsMemory {
  /** Total system memory in bytes (`os.totalmem()`). */
  totalBytes: number
  /** Free system memory in bytes (`os.freemem()`). */
  freeBytes: number
  /** totalBytes - freeBytes. */
  usedBytes: number
  /** Fraction 0..1 of total system memory currently in use. */
  usedFraction: number
  /** Node process resident set size in bytes. */
  rssBytes: number
  /** Node process heap used in bytes. */
  heapUsedBytes: number
  /** Node process heap allocated in bytes. */
  heapTotalBytes: number
}

/** VPS-level CPU snapshot for the /stats "Crawler status" panel. */
export interface SystemStatsCpu {
  /** 1-minute run-queue load average (`os.loadavg()[0]`). */
  load1: number
  /** 5-minute run-queue load average. */
  load5: number
  /** 15-minute run-queue load average. */
  load15: number
  /** Logical CPU cores (`os.cpus().length`). */
  cores: number
  /** 1-minute load average normalized to cores (load1 / cores). 1.0 = saturated. */
  loadFraction: number
}

/** In-process request-rate snapshot for the /stats "Crawler status" panel. */
export interface SystemStatsRps {
  /** Smoothed requests/sec over the trailing 60s (count / 60). */
  current: number
  /** Peak requests/sec observed in any 1s bucket over the trailing 60s. */
  peak: number
  /** Total requests served since the Node process started. */
  total: number
  /** Node process uptime in seconds. */
  uptimeSec: number
}

export interface SystemStatsResponse {
  memory: SystemStatsMemory
  cpu: SystemStatsCpu
  rps: SystemStatsRps
  /** Epoch ms when this snapshot was sampled (not when it was served). */
  generatedAt: number
}
