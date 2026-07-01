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
}

export const RATE_LIMIT_BINDINGS = {
  api: 'API_RATE_LIMITER',
  favorites: 'FAV_RATE_LIMITER',
  live: 'LIVE_RATE_LIMITER'
} as const satisfies Record<string, keyof RateLimitEnv>

export type RateLimitBindingName = keyof RateLimitEnv

/** Client IP — CF's header is authoritative in prod; the h3 helper covers dev. */
export function getClientIp(event: H3Event): string {
  return getRequestHeader(event, 'cf-connecting-ip')
    || getRequestIP(event, { xForwardedFor: true })
    || 'unknown'
}

/**
 * True when this request is over the per-IP budget for `name`.
 *
 * - No binding (node-server dev): never limited.
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
  if (!limiter) return false
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
