import os from 'node:os'
import process from 'node:process'
import type { SystemStatsResponse } from '#shared/stats'
import { getRps } from '../../utils/rpsTracker'

/**
 * Live VPS host metrics for the /stats "Crawler status" panel: system + Node
 * memory, run-queue load average, and the in-process request rate. The
 * node-server preset gives us `os` and `process` directly. Short SWR route rule
 * keeps the dashboard fresh without hammering origin.
 */
export default defineEventHandler((): SystemStatsResponse => {
  const totalBytes = os.totalmem()
  const freeBytes = os.freemem()
  const usedBytes = totalBytes - freeBytes
  const mem = process.memoryUsage()
  const [load1 = 0, load5 = 0, load15 = 0] = os.loadavg()
  const cores = os.cpus().length

  return {
    memory: {
      totalBytes,
      freeBytes,
      usedBytes,
      usedFraction: totalBytes > 0 ? usedBytes / totalBytes : 0,
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal
    },
    cpu: {
      load1,
      load5,
      load15,
      cores,
      loadFraction: cores > 0 ? load1 / cores : 0
    },
    rps: getRps(),
    generatedAt: Date.now()
  }
})
