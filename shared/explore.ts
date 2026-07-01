// Shared contract for the /explore platform layer. Imported from both the
// Nitro API routes (server) and the explore layer's Vue components/page via
// the `#shared/explore` alias, so the wire shape can never drift between the
// two ends.

export const EXPLORE_SOURCE_LIVE = 'live'
export const EXPLORE_SOURCE_CACHED = 'cached'
export type ExploreSource = typeof EXPLORE_SOURCE_LIVE | typeof EXPLORE_SOURCE_CACHED

export const EXPLORE_SORT_RECENT = 'recent'
export const EXPLORE_SORT_FAVORITES = 'favorites'
export type ExploreSort = typeof EXPLORE_SORT_RECENT | typeof EXPLORE_SORT_FAVORITES

/** A single facet option (country / city / org / manufacturer) plus how many cams carry it. */
export interface ExploreFacet {
  value: string
  count: number
}

export interface ExploreFacets {
  countries: ExploreFacet[]
  cities: ExploreFacet[]
  orgs: ExploreFacet[]
  manufacturers: ExploreFacet[]
}

/** Lightweight row rendered as a card in the grid. */
export interface ExploreCamCard {
  id: string
  country: string | null
  city: string | null
  org: string | null
  /** Camera vendor/brand (from Shodan's product banner), or null. */
  manufacturer: string | null
  /** Joined "City, Country" (or whichever parts exist), or null. */
  location: string | null
  isLive: boolean
  lat: number | null
  lon: number | null
  /** Highly-cached still thumbnail (never triggers a live probe). */
  thumb: string
  lastSeenAt: number | null
  /** Public favorite tally (deduped per IP server-side). */
  favCount: number
}

/**
 * Full detail for the single-camera dialog. Note: the raw IP is intentionally
 * never returned — like the roulette, we don't publish a directly-hittable list
 * of camera addresses. `port` / `module` are kept as harmless technical context.
 */
export interface ExploreCamDetail extends ExploreCamCard {
  port: number | null
  module: string | null
  firstSeenAt: number | null
  liveCheckedAt: number | null
  /** Whether this camera can be polled through the live probe endpoint right now. */
  liveProbeActive: boolean
  /** Live-or-still feed used inside the dialog (hits the live-probe route). */
  live: string
}

export interface ExploreListResponse {
  items: ExploreCamCard[]
  total: number
  page: number
  pageSize: number
}

export interface ExploreFavoriteRequest {
  on?: unknown
}

export interface ExploreFavoriteResponse {
  on: boolean
  count: number
}

/** Normalized, validated query the list endpoint actually runs on. */
export interface ExploreQuery {
  page: number
  pageSize: number
  source: ExploreSource
  sort: ExploreSort
  countries: string[]
  cities: string[]
  orgs: string[]
  manufacturers: string[]
  /** Explicit id allow-list (the viewer's cookie-based favorites). */
  ids: string[]
  q: string
}

export const EXPLORE_DEFAULT_PAGE_SIZE = 24
export const EXPLORE_MAX_PAGE_SIZE = 60
/** Cap multi-select filters so a hand-crafted URL can't blow up the IN-list. */
export const EXPLORE_MAX_FILTER_VALUES = 50
/** Favorites cap — tied to the filter-value cap so the cookie's id list
 *  always fits in one `id IN (...)` filter. */
export const EXPLORE_MAX_FAVORITES = EXPLORE_MAX_FILTER_VALUES
/** Cap on options returned per facet so the sidebar payload stays small. */
export const EXPLORE_FACET_LIMIT = 300
/** Typeahead results per facet search request (kept small — full lists use /facets). */
export const EXPLORE_FACET_SEARCH_LIMIT = 50
/** Minimum typed length before a facet search hits the server (1-char uses the preloaded list). */
export const EXPLORE_FACET_SEARCH_MIN_TERM = 2

export type ExploreFacetField = 'country' | 'city' | 'org' | 'manufacturer'

export const EXPLORE_FACET_FIELDS: readonly ExploreFacetField[] = [
  'country',
  'city',
  'org',
  'manufacturer'
] as const

/**
 * Normalize query-param value(s) — repeated (`country=US&country=CA`),
 * bracketed (`country[]=US`) or single — into a deduped string list capped at
 * EXPLORE_MAX_FILTER_VALUES. Shared by the server-side query parser and the
 * client's URL-synced filter state so the two ends can't drift.
 */
export function toFilterValues(...candidates: unknown[]): string[] {
  const out: string[] = []
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) if (typeof item === 'string' && item) out.push(item)
    } else if (typeof candidate === 'string' && candidate) {
      out.push(candidate)
    }
  }
  return [...new Set(out)].slice(0, EXPLORE_MAX_FILTER_VALUES)
}

/** Lenient integer parse for query params; junk input yields `fallback`. */
export function toQueryInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string'
    ? Number.parseInt(value, 10)
    : typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(n) ? n : fallback
}
