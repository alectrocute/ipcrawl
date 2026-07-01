// Shared status/refresh API contracts. Server handlers return these shapes and
// UI components consume them directly.

export type RefreshRunStatus = 'running' | 'ok' | 'error'

export interface RefreshQueryError {
  query: string
  error: string
}

export interface RefreshRunRecord {
  /** ISO timestamp; also the record's identity within the log. */
  startedAt: string
  finishedAt?: string
  durationMs?: number
  status: RefreshRunStatus
  /** Last liveness signal from an in-flight run. */
  heartbeatAt?: string
  /** Unique cams stored (ok runs only). */
  count?: number
  blocked?: number
  /** R2 screenshot puts performed / skipped as unchanged. */
  written?: number
  skipped?: number
  /** Per-query Shodan errors (the run still completes). */
  queryErrors?: RefreshQueryError[]
  /** Fatal error message for status === 'error'. */
  error?: string
}

export interface RefreshLastRun {
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  status: RefreshRunStatus
  count: number | null
  error: string | null
}

export interface RefreshStatusResponse {
  refreshedAt: string | null
  running: boolean
  runStartedAt: string | null
  lastRun: RefreshLastRun | null
}

export interface SiteStatusResponse {
  refreshedAt: string | null
  count: number
  blocked: number
  runs: RefreshRunRecord[]
}

export interface RefreshOutcome {
  count: number
  blocked: number
  errors: RefreshQueryError[]
}

export interface ManualRefreshResponse {
  ok: true
  triggeredAt: string
  elapsedMs: number
  result: RefreshOutcome
}
