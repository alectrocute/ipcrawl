import type { H3Event } from 'h3'
import { CAM_QUERY_COORDS, CAM_QUERY_EXCLUDE, CAM_QUERY_LIVE } from '#shared/routes'
import { listCams, type CamMeta } from '~~/server/utils/camStore'
import { buildCamPayload } from '~~/server/utils/camPayload'
import { filterLiveProbeCams } from '~~/server/utils/liveProbeStatus'
import { CACHE_CONTROL, HTTP_HEADER } from '~~/server/utils/httpCache'

interface RecentCamHistory {
  ids: string[]
}

const HISTORY_COOKIE = 'ipcrawl_recent'
const HISTORY_MAX_AGE = 60 * 60 * 24 * 30
const MAX_RECENT_IDS = 60
const UINT32_RANGE = 0x100000000

// Single-flight guard: if many requests land on an empty camera table simultaneously
// (very likely the seconds after a fresh Cloudflare deploy), we don't want
// each one to fire its own refresh and hammer Shodan. The first request
// owns the refresh; everyone else awaits the same Promise.
let warming: Promise<CamMeta[]> | null = null

async function ensureCams(): Promise<CamMeta[]> {
  const cached = await listCams()
  if (cached.length > 0) return cached

  if (!warming) {
    console.log('[ipcrawl] Cold cache — running cams:refresh inline.')
    warming = runTask('cams:refresh')
      .then(() => listCams())
      .finally(() => { warming = null })
  }
  return warming
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .slice(0, limit)
}

function readHistory(event: H3Event): RecentCamHistory {
  const fallback: RecentCamHistory = { ids: [] }
  const raw = getCookie(event, HISTORY_COOKIE)
  if (!raw) return fallback

  try {
    const parsed = JSON.parse(raw) as Partial<RecentCamHistory>
    return {
      ids: normalizeStringArray(parsed.ids, MAX_RECENT_IDS)
    }
  } catch {
    return fallback
  }
}

function randomIndex(length: number): number {
  const limit = UINT32_RANGE - (UINT32_RANGE % length)
  const buffer = new Uint32Array(1)
  let value = UINT32_RANGE

  while (value >= limit) {
    crypto.getRandomValues(buffer)
    value = buffer[0]!
  }

  return value % length
}

function constrainedPool(
  pool: CamMeta[],
  history: RecentCamHistory,
  excludeId: string | null
): CamMeta[] {
  const excludedIds = new Set(history.ids)
  if (excludeId) excludedIds.add(excludeId)

  const freshIds = pool.filter(cam => !excludedIds.has(cam.id))
  if (freshIds.length > 0) return freshIds

  return pool
}

function writeHistory(event: H3Event, history: RecentCamHistory, cam: CamMeta, poolSize: number) {
  const idLimit = Math.min(MAX_RECENT_IDS, Math.max(1, Math.floor(poolSize / 3)))
  const next: RecentCamHistory = {
    ids: [cam.id, ...history.ids.filter(id => id !== cam.id)].slice(0, idLimit)
  }

  setCookie(event, HISTORY_COOKIE, JSON.stringify(next), {
    httpOnly: true,
    maxAge: HISTORY_MAX_AGE,
    path: '/',
    sameSite: 'lax'
  })
}

function firstQueryString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (Array.isArray(value)) return firstQueryString(value[0])
  return null
}

/**
 * Returns metadata + a stable image URL for a random cam. The cam's network
 * address and screenshot blob never appear in this payload — clients fetch
 * frames separately via /api/live/{id}.jpg.
 *
 * If the camera table is empty (e.g. fresh Cloudflare deploy before the first cron
 * tick), the refresh task runs inline so the very first visitor seeds the
 * database/R2.
 */
export default defineEventHandler(async (event) => {
  const allCams = await ensureCams()

  if (allCams.length === 0) {
    throw createError({
      statusCode: 503,
      statusMessage: 'No cams available yet. Try again in a moment.'
    })
  }

  const query = getQuery(event)
  const liveOnly = query[CAM_QUERY_LIVE] === '1'
  // Guess Mode needs scoreable rounds — filter server-side so the client
  // gets a locatable cam in one round trip instead of redrawing blindly.
  const coordsOnly = query[CAM_QUERY_COORDS] === '1'
  const excludeId = firstQueryString(query[CAM_QUERY_EXCLUDE])
  let pool = liveOnly ? await filterLiveProbeCams(allCams) : allCams
  if (coordsOnly) {
    pool = pool.filter(cam => typeof cam.lat === 'number' && typeof cam.lon === 'number')
  }

  if (pool.length === 0) {
    throw createError({
      statusCode: 503,
      statusMessage: liveOnly
        ? 'No live-capable channels available right now.'
        : coordsOnly
          ? 'No locatable channels available right now.'
          : 'No cams available yet. Try again in a moment.'
    })
  }

  const history = readHistory(event)
  const candidates = constrainedPool(pool, history, excludeId)
  const cam = candidates[randomIndex(candidates.length)]!
  writeHistory(event, history, cam, pool.length)

  // Random per viewer — must never be cached, even by shared CDN layers.
  setResponseHeader(event, HTTP_HEADER.cacheControl, CACHE_CONTROL.noStore)

  return await buildCamPayload(cam, pool.length)
})
