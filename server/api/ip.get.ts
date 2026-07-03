import type { CheckMyIpResponse } from '#shared/checkMyIp'
import { getExploreDb } from '../utils/exploreDb'
import { getClientIp } from '../utils/rateLimit'

// Public, no-auth, CORS-* exposure check. A visitor hits this and learns
// whether their own forwarded IP appears in the catalogue. The response varies
// by requesting IP, so caching is browser-only (`private`) — a CDN would
// otherwise pin one visitor's answer for everyone. Browsers naturally key
// their own cache by their own IP, which is exactly the "5 min per IP" intent.
const CACHE_CONTROL = 'private, max-age=300, must-revalidate'

/**
 * `GET /api/ip` — the one public API endpoint.
 *
 * Resolves the requesting IP from `cf-connecting-ip` (then x-forwarded-for),
 * does an indexed existence probe against `cams.ip`, and returns
 * `{ found, ip, checkedAt }`. CORS-open so third-party pages (e.g.
 * ismycameraexposed.com) can call it directly from the browser. Cache headers
 * pin the answer per IP for 5 minutes at the browser; `checkedAt` lets a
 * caller compute the age and tell a fresh answer from a cached one.
 *
 * Host-restricted to the IMCE marketing domain (`NUXT_PUBLIC_IMCE_DOMAIN`,
 * e.g. ismycameraexposed.com). The endpoint is the API surface of the "Is My
 * Camera Exposed?" campaign, so it should read as living on that domain — a
 * request to `ipcrawl.com/api/ip` 404s rather than answering. When the env
 * var is empty (local dev, tests), the check is a no-op so `localhost:3000`
 * still works.
 */
export default defineEventHandler(async (event): Promise<CheckMyIpResponse> => {
  // Host gate — runs before any work so a disallowed host never touches the
  // DB or sets cache headers. Mirrors the IMCE middleware's host check.
  const imceDomain = useRuntimeConfig(event).public.imceDomain
  if (imceDomain) {
    const host = getRequestHost(event, { xForwardedHost: true })
    const bareHost = host?.split(':')[0]?.toLowerCase()
    if (bareHost !== String(imceDomain).toLowerCase()) {
      // 404, not 403 — the endpoint should read as non-existent on other hosts,
      // not as a forbidden secret.
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
  }

  setResponseHeader(event, 'cache-control', CACHE_CONTROL)

  // Captured once so every return path reports the same origin hit time. When
  // the browser serves a cached response, this is the timestamp from the
  // original origin hit — so `Date.now() - checkedAt` is the cache age.
  const checkedAt = Date.now()
  const ip = getClientIp(event)

  // No forwarded IP at all (e.g. direct localhost hit in dev) — answer
  // truthfully rather than 500ing. The visitor simply isn't in the catalogue.
  if (!ip || ip === 'unknown') {
    return { found: false, ip: ip || 'unknown', checkedAt }
  }

  try {
    const db = await getExploreDb(event)
    const row = await db
      .prepare('SELECT 1 AS x FROM cams WHERE ip = ? LIMIT 1')
      .bind(ip)
      .first<{ x: number }>()
    return { found: !!row, ip, checkedAt }
  } catch (err) {
    // A cold / unmigrated DB shouldn't 500 the check — degrade to "not found"
    // so the visitor gets a (reassuring) answer instead of an error.
    console.error('[ipcrawl] /api/ip failed:', err)
    return { found: false, ip, checkedAt }
  }
})
