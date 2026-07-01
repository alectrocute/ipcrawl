import type { H3Event } from 'h3'
import { assertRateLimit, RATE_LIMIT_BINDINGS } from './rateLimit'

/**
 * Rate-limit thumb origin misses. Edge-cache hits are checked before this runs.
 *
 * Grid `<img>` tags use `referrerpolicy="no-referrer"`, so Referer is useless
 * for telling browsers from scrapers. Sec-Fetch-* is the signal instead:
 * same-site loads send Dest:image + Site:same-origin; curl/direct hotlinks
 * omit Site or send cross-site and get the tighter hotlink budget.
 */
export async function assertThumbRateLimit(event: H3Event): Promise<void> {
  const dest = getRequestHeader(event, 'sec-fetch-dest')?.toLowerCase()
  if (dest && dest !== 'image') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const site = getRequestHeader(event, 'sec-fetch-site')?.toLowerCase()
  const hotlink = !site || site === 'cross-site' || site === 'cross-origin'
  await assertRateLimit(
    event,
    hotlink ? RATE_LIMIT_BINDINGS.thumbHotlink : RATE_LIMIT_BINDINGS.thumb
  )
}
