import type { RefreshStatusResponse } from '#shared/status'
import { readMeta } from '../../utils/camStore'
import { listRuns, isRunLive } from '../../utils/refreshLog'

/**
 * Live state of the cams:refresh task, shaped for the frontend sync card.
 * Unlike /api/status (a diagnostic dump with a 60s SWR window), this is the
 * "what is the refresher doing *right now*" endpoint: short cache so the UI
 * flips to "syncing" within seconds of a run starting — cron or manual.
 */

export default defineEventHandler(async (): Promise<RefreshStatusResponse> => {
  // listRuns reaps heartbeat-silent runs, so a worker killed mid-refresh
  // (CPU/wall-clock limit) reads as a failed run, not a perpetual sync.
  const [meta, runs] = await Promise.all([readMeta(), listRuns()])

  const current = runs.find(r => isRunLive(r)) ?? null
  const lastCompleted = runs.find(r => r.status === 'ok' || r.status === 'error') ?? null

  return {
    // Anchor for the countdown: last *successful* sync. D1 meta is the
    // canonical source (it predates the KV run log); fall back to the log.
    refreshedAt: meta?.refreshedAt
      ?? runs.find(r => r.status === 'ok')?.startedAt
      ?? null,
    running: current !== null,
    runStartedAt: current?.startedAt ?? null,
    lastRun: lastCompleted === null
      ? null
      : {
          startedAt: lastCompleted.startedAt,
          finishedAt: lastCompleted.finishedAt ?? null,
          durationMs: lastCompleted.durationMs ?? null,
          status: lastCompleted.status,
          count: lastCompleted.count ?? null,
          error: lastCompleted.error ?? null
        }
  }
})
