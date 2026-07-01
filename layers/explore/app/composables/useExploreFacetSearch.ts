import type { ExploreFacet, ExploreFacetField } from '#shared/explore'
import { EXPLORE_FACET_SEARCH_MIN_TERM } from '#shared/explore'
import { API_EXPLORE_FACET_SEARCH } from '#shared/routes'

export interface FacetMenuItem { label: string, value: string, count: number }

/** Keep already-selected values visible even when absent from search results. */
export function buildFacetMenuItems(facet: ExploreFacet[], selected: string[]): FacetMenuItem[] {
  const map = new Map<string, FacetMenuItem>()
  for (const f of facet) map.set(f.value, { label: f.value, value: f.value, count: f.count })
  for (const s of selected) if (!map.has(s)) map.set(s, { label: s, value: s, count: 0 })
  return [...map.values()]
}

interface FacetSearchOptions {
  field: ExploreFacetField
  filterQuery: MaybeRefOrGetter<Record<string, unknown>>
  baseline: MaybeRefOrGetter<ExploreFacet[]>
  selected: MaybeRefOrGetter<string[]>
}

/**
 * Server-backed typeahead for one facet USelectMenu. Short terms (below
 * EXPLORE_FACET_SEARCH_MIN_TERM) show the preloaded baseline; longer terms
 * debounce into `/api/explore/facets/search`.
 */
export function useExploreFacetSearch(options: FacetSearchOptions) {
  const searchTerm = ref('')
  const searchResults = ref<ExploreFacet[]>([])
  const searchLoading = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let reqId = 0

  const items = computed(() => {
    const term = searchTerm.value.trim()
    let facet: ExploreFacet[]
    if (term.length >= EXPLORE_FACET_SEARCH_MIN_TERM) {
      facet = searchResults.value
    } else {
      facet = toValue(options.baseline)
      if (term.length > 0) {
        const lower = term.toLowerCase()
        facet = facet.filter(f => f.value.toLowerCase().includes(lower))
      }
    }
    return buildFacetMenuItems(facet, toValue(options.selected))
  })

  async function fetchSearch(term: string) {
    const id = ++reqId
    searchLoading.value = true
    try {
      const data = await $fetch<ExploreFacet[]>(API_EXPLORE_FACET_SEARCH, {
        query: { ...toValue(options.filterQuery), field: options.field, term }
      })
      if (id === reqId) searchResults.value = data
    } catch {
      if (id === reqId) searchResults.value = []
    } finally {
      if (id === reqId) searchLoading.value = false
    }
  }

  function scheduleSearch(term: string) {
    if (timer) clearTimeout(timer)
    if (term.length < EXPLORE_FACET_SEARCH_MIN_TERM) {
      searchResults.value = []
      searchLoading.value = false
      return
    }
    timer = setTimeout(() => fetchSearch(term), 300)
  }

  watch(searchTerm, term => scheduleSearch(term.trim()))
  watch(() => toValue(options.filterQuery), () => {
    scheduleSearch(searchTerm.value.trim())
  })

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return { searchTerm, items, searchLoading }
}
