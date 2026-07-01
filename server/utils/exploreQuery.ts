import type { H3Event } from 'h3'
import type { ExploreQuery, ExploreSort, ExploreSource } from '#shared/explore'
import {
  EXPLORE_DEFAULT_PAGE_SIZE,
  EXPLORE_MAX_PAGE_SIZE,
  EXPLORE_SORT_FAVORITES,
  EXPLORE_SORT_RECENT,
  EXPLORE_SOURCE_CACHED,
  EXPLORE_SOURCE_LIVE,
  toFilterValues,
  toQueryInt
} from '#shared/explore'

/**
 * Parse + validate the explore filter state from the request query. Accepts
 * both repeated (`country=US&country=CA`) and bracketed (`country[]=US`) forms
 * so the URL stays robust to whoever builds it.
 */
export function parseExploreQuery(event: H3Event): ExploreQuery {
  const q = getQuery(event)
  const source: ExploreSource = q.source === EXPLORE_SOURCE_LIVE ? EXPLORE_SOURCE_LIVE : EXPLORE_SOURCE_CACHED
  const sort: ExploreSort = q.sort === EXPLORE_SORT_RECENT ? EXPLORE_SORT_RECENT : EXPLORE_SORT_FAVORITES

  return {
    page: Math.max(1, toQueryInt(q.page, 1)),
    pageSize: Math.min(EXPLORE_MAX_PAGE_SIZE, Math.max(1, toQueryInt(q.pageSize, EXPLORE_DEFAULT_PAGE_SIZE))),
    source,
    sort,
    countries: toFilterValues(q.country, q['country[]']),
    cities: toFilterValues(q.city, q['city[]']),
    orgs: toFilterValues(q.org, q['org[]']),
    manufacturers: toFilterValues(q.manufacturer, q['manufacturer[]']),
    ids: toFilterValues(q.id, q['id[]']),
    q: typeof q.q === 'string' ? q.q.trim().slice(0, 80) : ''
  }
}
