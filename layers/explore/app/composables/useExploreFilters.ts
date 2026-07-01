import type { ExploreSort, ExploreSource } from '#shared/explore'
import {
  EXPLORE_DEFAULT_PAGE_SIZE,
  EXPLORE_SORT_FAVORITES,
  EXPLORE_SORT_RECENT,
  EXPLORE_SOURCE_CACHED,
  EXPLORE_SOURCE_LIVE,
  toFilterValues,
  toQueryInt
} from '#shared/explore'

type QueryPatch = Record<string, string | string[] | number | undefined>

/**
 * URL-synced filter state for the root catalogue. The query string is the single source
 * of truth so every view is SSR-correct, shareable and bookmarkable: consumers
 * are controlled components that emit changes, which `commit` folds back into
 * the URL.
 */
export function useExploreFilters() {
  const route = useRoute()
  const router = useRouter()

  const pageSize = EXPLORE_DEFAULT_PAGE_SIZE
  const source = computed<ExploreSource>(() =>
    route.query.source === EXPLORE_SOURCE_LIVE ? EXPLORE_SOURCE_LIVE : EXPLORE_SOURCE_CACHED
  )
  const sort = computed<ExploreSort>(() =>
    route.query.sort === EXPLORE_SORT_RECENT ? EXPLORE_SORT_RECENT : EXPLORE_SORT_FAVORITES
  )
  const countries = computed(() => toFilterValues(route.query.country))
  const cities = computed(() => toFilterValues(route.query.city))
  const orgs = computed(() => toFilterValues(route.query.org))
  const manufacturers = computed(() => toFilterValues(route.query.manufacturer))
  const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
  const page = computed(() => Math.max(1, toQueryInt(route.query.page, 1)))

  // Favorites are cookie-backed (SSR sees them too); ?fav=1 narrows the grid
  // to the favorited ids, which travel to the API as an explicit `id`
  // allow-list so the per-query-string SWR cache stays correct across users.
  const { favorites: favoriteIds } = useExploreFavorites()
  const favOnly = computed(() => route.query.fav === '1')
  const favoriteCount = computed(() => favoriteIds.value.length)
  const favIdFilter = computed(() =>
    (favOnly.value && favoriteIds.value.length > 0 ? favoriteIds.value : undefined)
  )

  const listQuery = computed(() => ({
    source: source.value,
    sort: sort.value,
    country: countries.value,
    city: cities.value,
    org: orgs.value,
    manufacturer: manufacturers.value,
    id: favIdFilter.value,
    q: q.value || undefined,
    page: page.value,
    pageSize
  }))
  // Facets are cross-filtered server-side by the *other* active selections, so
  // send the full filter state (minus pagination). Each dropdown then narrows
  // to what's reachable given the rest (e.g. cities within chosen countries).
  const facetsQuery = computed(() => ({
    source: source.value,
    country: countries.value,
    city: cities.value,
    org: orgs.value,
    manufacturer: manufacturers.value,
    id: favIdFilter.value,
    q: q.value || undefined
  }))

  function commit(patch: QueryPatch, opts: { resetPage?: boolean, replace?: boolean } = {}) {
    const merged: Record<string, unknown> = { ...route.query, ...patch }
    if (opts.resetPage) merged.page = undefined
    // Keep the canonical default (cached) out of the URL.
    if (merged.source === EXPLORE_SOURCE_CACHED) merged.source = undefined
    if (merged.sort === EXPLORE_SORT_FAVORITES) merged.sort = undefined

    const next: Record<string, string | string[]> = {}
    for (const [key, value] of Object.entries(merged)) {
      if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue
      next[key] = value as string | string[]
    }

    const method = opts.replace ? router.replace : router.push
    method.call(router, { query: next })
  }

  const setSource = (value: ExploreSource) => commit({ source: value }, { resetPage: true, replace: true })
  const setSort = (value: ExploreSort) => commit({ sort: value }, { resetPage: true, replace: true })
  const setCountries = (value: string[]) => commit({ country: value }, { resetPage: true, replace: true })
  const setCities = (value: string[]) => commit({ city: value }, { resetPage: true, replace: true })
  const setOrgs = (value: string[]) => commit({ org: value }, { resetPage: true, replace: true })
  const setManufacturers = (value: string[]) => commit({ manufacturer: value }, { resetPage: true, replace: true })
  const setQ = (value: string) => commit({ q: value }, { resetPage: true, replace: true })
  const setFavOnly = (value: boolean) => commit({ fav: value ? '1' : undefined }, { resetPage: true, replace: true })
  const clearAll = () => router.replace({ query: {} })

  // An empty favorites list can't be expressed as an id filter (no `id` params
  // = unfiltered), so if the last favorite is removed while the filter is on —
  // or ?fav=1 is deep-linked without the cookie — drop the param.
  function healFavParam() {
    if (favOnly.value && favoriteIds.value.length === 0) {
      commit({ fav: undefined }, { replace: true })
    }
  }
  onMounted(healFavParam)
  watch(() => favoriteIds.value.length, healFavParam)

  return {
    pageSize,
    source,
    sort,
    countries,
    cities,
    orgs,
    manufacturers,
    q,
    page,
    favOnly,
    favoriteCount,
    listQuery,
    facetsQuery,
    commit,
    setSource,
    setSort,
    setCountries,
    setCities,
    setOrgs,
    setManufacturers,
    setQ,
    setFavOnly,
    clearAll
  }
}
