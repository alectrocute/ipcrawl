import type { ExploreFavoriteRequest, ExploreFavoriteResponse } from '#shared/explore'
import { setFavorite } from '~~/server/utils/exploreStore'
import { assertRateLimit, getClientIp, RATE_LIMIT_BINDINGS } from '~~/server/utils/rateLimit'

/**
 * Toggle one public favorite vote for a cam. Votes are tallied per anonymized
 * client IP (peppered SHA-256, raw IP never stored), so mashing the heart —
 * or replaying the request — can't inflate a cam's count past 1 per address.
 * As the only client-triggered D1 write path it's additionally behind the
 * FAV_RATE_LIMITER per-IP budget; the client treats a 429 by rolling back its
 * optimistic count while keeping the personal cookie bookmark.
 */

async function voterHash(ip: string): Promise<string> {
  const pepper = useRuntimeConfig().voterPepper
  if (!pepper) throw createError({ statusCode: 500, statusMessage: 'NUXT_VOTER_PEPPER not configured' })
  const data = new TextEncoder().encode(`${pepper}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

export default defineEventHandler(async (event): Promise<ExploreFavoriteResponse> => {
  // Before any D1 work — rate-limited requests must cost nothing.
  await assertRateLimit(event, RATE_LIMIT_BINDINGS.favorites)

  const id = (getRouterParam(event, 'id') || '').trim()
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing cam id' })
  }

  const body = await readBody<ExploreFavoriteRequest>(event).catch((): ExploreFavoriteRequest => ({}))
  const on = body?.on === true

  const result = await setFavorite(id, await voterHash(getClientIp(event)), on, Date.now(), event)
  if (!result.ok) {
    if (result.reason === 'not_found') {
      throw createError({ statusCode: 404, statusMessage: 'Cam not found' })
    }
    throw createError({ statusCode: 429, statusMessage: 'Favorite limit reached' })
  }

  return { on, count: result.count }
})
