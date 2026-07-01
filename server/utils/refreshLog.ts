/**
 * Persistent run history for the `cams:refresh` task, stored in KV (the
 * `cams` namespace) rather than D1 on purpose: the D1 `cam_refresh_meta` row
 * is only written on a *successful* run with results, so it can't tell you
 * about runs that crashed, returned nothing, or never fired. This log records
 * every attempt — start, finish, duration, outcome — so "is the cron actually
 * running?" is answerable from /api/status without digging through the
 * Cloudflare dashboard.
 */

import type { RefreshRunRecord } from '#shared/status'

const RUNS_KEY = 'refresh:runs'
const MAX_RUNS = 20

/**
 * A 'running' record with no heartbeat for this long is presumed dead.
 * Heartbeats land at least every ~60s while the task progresses, so 5 minutes
 * of silence means the isolate was killed (limits, eviction, deploy).
 */
export const RUN_DEAD_AFTER_MS = 5 * 60 * 1000

export function isRunLive(run: RefreshRunRecord, now = Date.now()): boolean {
  if (run.status !== 'running') return false
  const signal = Date.parse(run.heartbeatAt ?? run.startedAt)
  return Number.isFinite(signal) && now - signal < RUN_DEAD_AFTER_MS
}

/**
 * Finalize orphaned 'running' records in place. Returns whether anything
 * changed so callers can skip the KV write-back when the log is clean.
 */
function reapDeadRuns(runs: RefreshRunRecord[], now = Date.now()): boolean {
  let changed = false
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!
    if (run.status !== 'running' || isRunLive(run, now)) continue
    runs[i] = {
      ...run,
      status: 'error',
      error: 'never finalized — worker likely killed by CPU/wall-clock limits or evicted mid-run'
    }
    changed = true
  }
  return changed
}

function storage() {
  return useStorage('cams')
}

async function readRuns(): Promise<RefreshRunRecord[]> {
  const raw = await storage().getItem<RefreshRunRecord[]>(RUNS_KEY)
  return Array.isArray(raw) ? raw : []
}

async function writeRuns(runs: RefreshRunRecord[]): Promise<void> {
  await storage().setItem(RUNS_KEY, runs.slice(0, MAX_RUNS))
}

/**
 * Record that a run has started. Written before any Shodan work so even a
 * crash mid-run leaves a visible 'running' record (a stale 'running' entry
 * older than the cron interval reads as "that run died").
 */
export async function recordRunStart(startedAt: string): Promise<void> {
  try {
    const runs = await readRuns()
    reapDeadRuns(runs)
    runs.unshift({ startedAt, status: 'running' })
    await writeRuns(runs)
  } catch (err) {
    // Observability must never take down the refresh itself.
    console.error('[ipcrawl] refresh log: failed to record run start:', err)
  }
}

/**
 * Bump the in-flight run's liveness signal. Called periodically from the
 * refresh task; if these stop arriving, the run is reaped as dead after
 * RUN_DEAD_AFTER_MS.
 */
export async function recordRunHeartbeat(startedAt: string): Promise<void> {
  try {
    const runs = await readRuns()
    const run = runs.find(r => r.startedAt === startedAt)
    if (!run || run.status !== 'running') return
    run.heartbeatAt = new Date().toISOString()
    await writeRuns(runs)
  } catch (err) {
    console.error('[ipcrawl] refresh log: failed to record heartbeat:', err)
  }
}

/**
 * Finalize the record created by `recordRunStart`. Falls back to prepending a
 * fresh record if the start write was lost (KV hiccup) so the outcome is
 * never dropped.
 */
export async function recordRunFinish(
  startedAt: string,
  outcome: Omit<RefreshRunRecord, 'startedAt' | 'finishedAt' | 'durationMs' | 'status'> & {
    status: 'ok' | 'error'
  }
): Promise<void> {
  try {
    const finishedAt = new Date().toISOString()
    const durationMs = Date.parse(finishedAt) - Date.parse(startedAt)
    const record: RefreshRunRecord = { startedAt, finishedAt, durationMs, ...outcome }

    const runs = await readRuns()
    const idx = runs.findIndex(r => r.startedAt === startedAt)
    if (idx >= 0) runs[idx] = record
    else runs.unshift(record)
    await writeRuns(runs)
  } catch (err) {
    console.error('[ipcrawl] refresh log: failed to record run finish:', err)
  }
}

export async function listRuns(): Promise<RefreshRunRecord[]> {
  try {
    const runs = await readRuns()
    // Self-heal on read: a run killed by the platform never finalizes itself,
    // so the log would otherwise show 'running' forever. The write-back only
    // happens when something was actually reaped (at most a handful of times
    // per dead run, even across racing isolates — last-write-wins is fine
    // because every racer marks the same record the same way).
    if (reapDeadRuns(runs)) await writeRuns(runs)
    return runs
  } catch {
    return []
  }
}
