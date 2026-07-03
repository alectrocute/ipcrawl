import type { SystemStatsResponse } from '#shared/stats'
import { getRps } from '../../utils/rpsTracker'

// The project deliberately keeps `@types/node` out of the dev deps (see the
// matching pattern in server/utils/exploreDb.ts). Node built-ins are reached
// via `globalThis.process.getBuiltinModule('node:<name>')` with a minimal
// inline-typed surface, which typechecks under pnpm's strict isolation too.
interface OsModule {
  totalmem(): number
  freemem(): number
  loadavg(): [number, number, number]
  cpus(): unknown[]
}

interface MemoryUsage {
  rss: number
  heapUsed: number
  heapTotal: number
}

interface NodeProcess {
  getBuiltinModule?: (id: string) => unknown
  memoryUsage?(): MemoryUsage
}

function getNodeProcess(): NodeProcess {
  return (globalThis as { process?: NodeProcess }).process ?? {}
}

/**
 * Live VPS host metrics for the /stats "Crawler status" panel: system + Node
 * memory, run-queue load average, and the in-process request rate. The
 * node-server preset gives us `os` and `process` directly. Short SWR route rule
 * keeps the dashboard fresh without hammering origin.
 */
export default defineEventHandler((): SystemStatsResponse => {
  const proc = getNodeProcess()
  const os = proc.getBuiltinModule?.('node:os') as OsModule | undefined
  if (!os) {
    throw createError({ statusCode: 500, statusMessage: 'node:os unavailable' })
  }

  const totalBytes = os.totalmem()
  const freeBytes = os.freemem()
  const usedBytes = totalBytes - freeBytes
  const mem = proc.memoryUsage?.() ?? { rss: 0, heapUsed: 0, heapTotal: 0 }
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
