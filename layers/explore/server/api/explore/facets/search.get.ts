import type { ExploreFacet } from '#shared/explore'
import { parseFacetSearchQuery } from '~~/server/utils/exploreQuery'
import { searchFacet } from '~~/server/utils/exploreStore'
import { assertRateLimit, RATE_LIMIT_BINDINGS } from '~~/server/utils/rateLimit'

/**
 * Server-side typeahead for one facet dropdown. Cross-filtered like
 * `/api/explore/facets`, but matches a substring on the searched column so
 * users can find values beyond the preloaded top-N. Heavily rate-limited and
 * long-SWR-cached — each keystroke would otherwise be a GROUP BY scan.
 */
export default defineEventHandler(async (event): Promise<ExploreFacet[]> => {
  // Behind the SWR route rule — only origin misses count toward the tight budget.
  await assertRateLimit(event, RATE_LIMIT_BINDINGS.facetSearch)
  const { query, field, term } = parseFacetSearchQuery(event)
  try {
    return await searchFacet(field, term, query, event)
  } catch (err) {
    console.error('[ipcrawl] /api/explore/facets/search failed:', err)
    return []
  }
})
