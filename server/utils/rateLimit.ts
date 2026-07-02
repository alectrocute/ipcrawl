import type { H3Event } from 'h3'

// Cloudflare Workers Rate Limiting API bindings (declared in wrangler.jsonc
// `ratelimits`). They're free, in-memory per colo, and best-effort — exactly
// right for a cost shield, wrong for anything security-critical.
export interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>
}

export interface RateLimitEnv {
  /** Shared per-IP budget for the D1-backed /api/explore read endpoints. */
  API_RATE_LIMITER?: RateLimitBinding
  /** Tighter per-IP budget for the favorite-vote write path. */
  FAV_RATE_LIMITER?: RateLimitBinding
  /** Expensive live frame path; this one fails closed in its endpoint. */
  LIVE_RATE_LIMITER?: RateLimitBinding
  /** Grid thumbnail origin misses from same-site `<img>` loads. */
  THUMB_RATE_LIMITER?: RateLimitBinding
  /** Direct/cross-site thumb fetches (no Sec-Fetch-Site, curl, hotlinks). */
  THUMB_HOTLINK_RATE_LIMITER?: RateLimitBinding
  /** Per-IP budget for facet typeahead searches (one GROUP BY per keystroke). */
  FACET_SEARCH_RATE_LIMITER?: RateLimitBinding
}

export const RATE_LIMIT_BINDINGS = {
  api: 'API_RATE_LIMITER',
  favorites: 'FAV_RATE_LIMITER',
  live: 'LIVE_RATE_LIMITER',
  thumb: 'THUMB_RATE_LIMITER',
  thumbHotlink: 'THUMB_HOTLINK_RATE_LIMITER',
  facetSearch: 'FACET_SEARCH_RATE_LIMITER'
} as const satisfies Record<string, keyof RateLimitEnv>

export type RateLimitBindingName = keyof RateLimitEnv

// --- node-server fallback -----------------------------------------------------
//
// Off Workers there are no rate-limit bindings, so without this the VPS build
// would run every endpoint unmetered. A single long-lived Node process is
// actually the same scope the Workers limiters had (per-colo, in-memory,
// best-effort), so an in-process sliding window is a faithful stand-in.
// Budgets mirror the `ratelimits` block that lived in wrangler.jsonc — see the
// per-limiter rationale comments there (kept in git history) for how each
// number was derived.
const FALLBACK_BUDGETS: Record<RateLimitBindingName, { limit: number, periodMs: number }> = {
  LIVE_RATE_LIMITER: { limit: 30, periodMs: 10_000 },
  API_RATE_LIMITER: { limit: 100, periodMs: 10_000 },
  THUMB_RATE_LIMITER: { limit: 150, periodMs: 10_000 },
  THUMB_HOTLINK_RATE_LIMITER: { limit: 20, periodMs: 10_000 },
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
  // All budgets share a 10s period; anything with no hit in the last period is
  // dead weight from an IP that moved on.
  for (const [key, hits] of fallbackWindows) {
    if (hits.length === 0 || now - hits[hits.length - 1]! > 10_000) {
      fallbackWindows.delete(key)
    }
  }
}

/**
 * In-process sliding-window check for environments without limiter bindings
 * (node-server / VPS). Exported for /api/live, which talks to its binding
 * directly (fail-closed) instead of going through `assertRateLimit`.
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
  // Drop hits that slid out of the window.
  const cutoff = now - periodMs
  let firstLive = 0
  while (firstLive < hits.length && hits[firstLive]! <= cutoff) firstLive++
  if (firstLive > 0) hits.splice(0, firstLive)

  if (hits.length >= limit) return true
  hits.push(now)
  return false
}

/** Client IP — CF's header is authoritative in prod; the h3 helper covers dev. */
export function getClientIp(event: H3Event): string {
  return getRequestHeader(event, 'cf-connecting-ip')
    || getRequestIP(event, { xForwardedFor: true })
    || 'unknown'
}

/**
 * True when this request is over the per-IP budget for `name`.
 *
 * - No binding (node-server): falls back to the in-process sliding window
 *   above, keyed the same way (`name:ip`).
 * - Binding errors fail OPEN with a warning: these limiters guard against
 *   *sustained* abuse of individually-cheap handlers, so a rare limiter outage
 *   should degrade to "unmetered" rather than brick the API. (Contrast with
 *   /api/live, which fails closed because it has a graceful cached fallback.)
 *
 * Call from inside the event handler — behind any route-rule SWR cache — so
 * only origin misses (the requests that actually cost D1 work) are metered.
 */
async function isRateLimited(event: H3Event, name: RateLimitBindingName): Promise<boolean> {
  const ctx = event.context as { cloudflare?: { env?: RateLimitEnv } }
  const limiter = ctx.cloudflare?.env?.[name]
  if (!limiter) return isFallbackLimited(name, `${name}:${getClientIp(event)}`)
  try {
    const { success } = await limiter.limit({ key: `${name}:${getClientIp(event)}` })
    return !success
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[ipcrawl] ${name} failed open: ${msg}`)
    return false
  }
}

/** Throw 429 when over the per-IP budget. Call before any D1/R2 work. */
export async function assertRateLimit(event: H3Event, name: RateLimitBindingName): Promise<void> {
  if (await isRateLimited(event, name)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }
}
