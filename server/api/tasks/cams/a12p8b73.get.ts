/**
 * Manual trigger for the `cams:refresh` Nitro task. The path itself is the
 * secret — Cloudflare won't surface it via robots/sitemap and the route is
 * marked `no-store` so it never leaks via cache. Use it to refresh the cam
 * table on demand instead of waiting for the scheduled cron.
 *
 * Concurrent requests share a single in-flight task run so we never burn
 * extra Shodan API credits or duplicate R2 writes. The dedup is per-isolate
 * (good enough; across isolates the cost is one re-run, not a thundering herd,
 * since each isolate's invocation still talks to the same D1/R2 stores).
 */

import type { TaskResult } from 'nitropack/types'
import type { ManualRefreshResponse, RefreshOutcome } from '#shared/status'
import { CACHE_CONTROL, HTTP_HEADER } from '../../../utils/httpCache'

let inflight: Promise<TaskResult<RefreshOutcome>> | null = null

export default defineEventHandler(async (event): Promise<ManualRefreshResponse> => {
  setResponseHeader(event, HTTP_HEADER.cacheControl, CACHE_CONTROL.noStore)

  const ip = getRequestHeader(event, 'cf-connecting-ip') || 'local'
  const startedAt = Date.now()

  if (!inflight) {
    console.log(`[ipcrawl] manual cams:refresh trigger by ${ip}`)
    inflight = runTask<RefreshOutcome>('cams:refresh').finally(() => {
      inflight = null
    })
  } else {
    console.log(`[ipcrawl] manual cams:refresh joining in-flight (caller=${ip})`)
  }

  try {
    const { result } = await inflight
    if (!result) throw new Error('Refresh task returned no result')
    const elapsedMs = Date.now() - startedAt
    console.log(`[ipcrawl] manual cams:refresh ok in ${elapsedMs}ms`)
    return {
      ok: true,
      triggeredAt: new Date(startedAt).toISOString(),
      elapsedMs,
      result
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ipcrawl] manual cams:refresh failed: ${message}`)
    throw createError({
      statusCode: 500,
      statusMessage: `Refresh task failed: ${message}`
    })
  }
})
