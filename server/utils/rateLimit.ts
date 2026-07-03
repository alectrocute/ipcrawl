import type { H3Event } from 'h3'

// Rate-limiter identifiers and their per-IP budgets. In-process sliding
// window — one long-lived Node process is the natural scope.
export const RATE_LIMIT_BINDINGS = {
  api: 'API_RATE_LIMITER',
  favorites: 'FAV_RATE_LIMITER',
  live: 'LIVE_RATE_LIMITER',
  thumb: 'THUMB_RATE_LIMITER',
  thumbHotlink: 'THUMB_HOTLINK_RATE_LIMITER',
  facetSearch: 'FACET_SEARCH_RATE_LIMITER'
} as const

export type RateLimitBindingName = (typeof RATE_LIMIT_BINDINGS)[keyof typeof RATE_LIMIT_BINDINGS]

const FALLBACK_BUDGETS: Record<RateLimitBindingName, { limit: number, periodMs: number }> = {
  LIVE_RATE_LIMITER: { limit: 30, periodMs: 10_000 },
  API_RATE_LIMITER: { limit: 100, periodMs: 10_000 },
  THUMB_RATE_LIMITER: { limit: 1000, periodMs: 10_000 },
  THUMB_HOTLINK_RATE_LIMITER: { limit: 200, periodMs: 10_000 },
  FAV_RATE_LIMITER: { limit: 25, periodMs: 10_000 },
  FACET_SEARCH_RATE_LIMITER: { limit: 10, periodMs: 10_000 }
}

/** Sliding-window hit log per key. Pruned lazily + swept periodically. */
const fallbackWindows = new Map<string, number[]>()
let lastSweep = 0
const SWEEP_INTERVAL_MS = 60_000

function sweepFallbackWindows(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [key, hits] of fallbackWindows) {
    if (hits.length === 0 || now - hits[hits.length - 1]! > 10_000) {
      fallbackWindows.delete(key)
    }
  }
}

/**
 * In-process sliding-window rate limit check. Exported for /api/live, which
 * uses it directly (fail-closed) instead of going through `assertRateLimit`.
 */
export function isFallbackLimited(name: RateLimitBindingName, key: string): boolean {
  const { limit, periodMs } = FALLBACK_BUDGETS[name]
  const now = Date.now()
  sweepFallbackWindows(now)

  let hits = fallbackWindows.get(key)
  if (!hits) {
    hits = []
    fallbackWindows.set(key, hits)
  }
  const cutoff = now - periodMs
  let firstLive = 0
  while (firstLive < hits.length && hits[firstLive]! <= cutoff) firstLive++
  if (firstLive > 0) hits.splice(0, firstLive)

  if (hits.length >= limit) return true
  hits.push(now)
  return false
}

/** Client IP — prefers the CDN header, falls back to h3's helper. */
export function getClientIp(event: H3Event): string {
  return getRequestHeader(event, 'cf-connecting-ip')
    || getRequestIP(event, { xForwardedFor: true })
    || 'unknown'
}

/** Throw 429 when over the per-IP budget. Call before any DB work. */
export async function assertRateLimit(event: H3Event, name: RateLimitBindingName): Promise<void> {
  const ip = getClientIp(event)
  if (isFallbackLimited(name, `${name}:${ip}`)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }
}
