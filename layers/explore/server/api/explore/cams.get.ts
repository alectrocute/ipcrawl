import type { ExploreListResponse } from '#shared/explore'
import { parseExploreQuery } from '~~/server/utils/exploreQuery'
import { queryCams } from '~~/server/utils/exploreStore'
import { assertRateLimit, RATE_LIMIT_BINDINGS } from '~~/server/utils/rateLimit'

/**
 * Paginated, filtered grid feed for /explore. Caching is handled by the
 * `/api/explore/cams` route rule (short SWR, keyed by the full query string),
 * so each filter+page combination is shielded into a single origin read; the
 * rate limit below therefore only meters cache *misses* (real D1 work).
 */
export default defineEventHandler(async (event): Promise<ExploreListResponse> => {
  await assertRateLimit(event, RATE_LIMIT_BINDINGS.api)
  const query = parseExploreQuery(event)
  try {
    return await queryCams(query, event)
  } catch (err) {
    // A cold / unmigrated DB shouldn't 500 the explorer — degrade to an empty
    // page so the grid can render its empty state instead of an error.
    console.error('[ipcrawl] /api/explore/cams failed:', err)
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize }
  }
})
