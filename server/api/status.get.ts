import type { SiteStatusResponse } from '#shared/status'
import { readMeta } from '../utils/camStore'
import { listRuns } from '../utils/refreshLog'

export default defineEventHandler(async (): Promise<SiteStatusResponse> => {
  const [meta, runs] = await Promise.all([readMeta(), listRuns()])
  return {
    refreshedAt: meta?.refreshedAt ?? null,
    count: meta?.count ?? 0,
    blocked: meta?.blocked ?? 0,
    // Per-attempt history of cams:refresh (KV-backed), newest first. Unlike
    // `refreshedAt` (which only moves on successful runs), this includes
    // crashed and in-flight runs — the "is the cron alive?" signal.
    runs
  }
})
