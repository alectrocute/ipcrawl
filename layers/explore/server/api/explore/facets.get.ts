import type { ExploreFacets } from '#shared/explore'
import { parseExploreQuery } from '~~/server/utils/exploreQuery'
import { getFacets } from '~~/server/utils/exploreStore'
import { assertRateLimit, RATE_LIMIT_BINDINGS } from '~~/server/utils/rateLimit'

const EMPTY: ExploreFacets = { countries: [], cities: [], orgs: [], manufacturers: [] }

/**
 * Sidebar facet options (country / city / org) with per-value counts. Each
 * facet is cross-filtered by the *other* active selections (and `source`/`q`),
 * so e.g. selecting a country trims the city/org lists to that country. Cached
 * by the `/api/explore/facets` route rule (keyed by the full query string) so
 * the GROUP BY scans aren't re-run per request for a given filter combination.
 */
export default defineEventHandler(async (event): Promise<ExploreFacets> => {
  // Behind the SWR route rule — only origin misses (3 GROUP BY scans) count.
  await assertRateLimit(event, RATE_LIMIT_BINDINGS.api)
  const query = parseExploreQuery(event)
  try {
    return await getFacets(query, event)
  } catch (err) {
    console.error('[ipcrawl] /api/explore/facets failed:', err)
    return EMPTY
  }
})
