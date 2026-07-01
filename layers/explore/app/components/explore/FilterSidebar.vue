<script setup lang="ts">
import type { ExploreFacet, ExploreFacets, ExploreSort, ExploreSource } from '#shared/explore'
import {
  EXPLORE_SORT_FAVORITES,
  EXPLORE_SORT_RECENT,
  EXPLORE_SOURCE_CACHED,
  EXPLORE_SOURCE_LIVE
} from '#shared/explore'

interface Props {
  source: ExploreSource
  sort: ExploreSort
  countries: string[]
  cities: string[]
  orgs: string[]
  manufacturers: string[]
  q: string
  facets: ExploreFacets
  facetsLoading: boolean
  favOnly: boolean
  favCount: number
}
const props = defineProps<Props>()
const emit = defineEmits<{
  'update:source': [value: ExploreSource]
  'update:sort': [value: ExploreSort]
  'update:countries': [value: string[]]
  'update:cities': [value: string[]]
  'update:orgs': [value: string[]]
  'update:manufacturers': [value: string[]]
  'update:q': [value: string]
  'update:favOnly': [value: boolean]
  'clear': []
}>()

interface FacetItem { label: string, value: string, count: number }
interface SortItem { label: string, value: ExploreSort }

const sortItems: SortItem[] = [
  { label: 'Most Favorited', value: EXPLORE_SORT_FAVORITES },
  { label: 'Recently Found', value: EXPLORE_SORT_RECENT }
]

// Keep already-selected values visible even if the current source filter
// dropped them out of the facet counts.
function buildItems(facet: ExploreFacet[], selected: string[]): FacetItem[] {
  const map = new Map<string, FacetItem>()
  for (const f of facet) map.set(f.value, { label: f.value, value: f.value, count: f.count })
  for (const s of selected) if (!map.has(s)) map.set(s, { label: s, value: s, count: 0 })
  return [...map.values()]
}

const countryItems = computed(() => buildItems(props.facets.countries, props.countries))
const cityItems = computed(() => buildItems(props.facets.cities, props.cities))
const orgItems = computed(() => buildItems(props.facets.orgs, props.orgs))
const manufacturerItems = computed(() => buildItems(props.facets.manufacturers, props.manufacturers))

const countriesModel = computed({
  get: () => props.countries,
  set: v => emit('update:countries', v)
})
const citiesModel = computed({
  get: () => props.cities,
  set: v => emit('update:cities', v)
})
const orgsModel = computed({
  get: () => props.orgs,
  set: v => emit('update:orgs', v)
})
const manufacturersModel = computed({
  get: () => props.manufacturers,
  set: v => emit('update:manufacturers', v)
})
const sortModel = computed({
  get: () => props.sort,
  set: v => emit('update:sort', v)
})
const sortSelectUi = computed(() => ({
  value: props.sort === EXPLORE_SORT_FAVORITES ? 'text-[var(--text-dim,#8b9591)]' : ''
}))

// Debounce the free-text box so typing doesn't refetch on every keystroke.
const qLocal = ref(props.q)
watch(() => props.q, (v) => {
  if (v !== qLocal.value) qLocal.value = v
})
let qTimer: ReturnType<typeof setTimeout> | null = null
watch(qLocal, (v) => {
  if (qTimer) clearTimeout(qTimer)
  // Skip echoes: when qLocal was just synced *from* props (clear-all, back/
  // forward nav), re-emitting the same value would needlessly reset the page.
  if (v.trim() === props.q) return
  qTimer = setTimeout(() => emit('update:q', v.trim()), 300)
})
onBeforeUnmount(() => {
  if (qTimer) clearTimeout(qTimer)
})

const hasActiveFilters = computed(() =>
  props.source === EXPLORE_SOURCE_LIVE
  || props.favOnly
  || props.countries.length > 0
  || props.cities.length > 0
  || props.orgs.length > 0
  || props.manufacturers.length > 0
  || props.q.length > 0
)
</script>

<template>
  <div class="filters">
    <div
      v-if="props.favCount > 0 || props.favOnly"
      class="filters__section"
    >
      <p class="filters__label">
        Filters
      </p>
      <button
        type="button"
        class="filters__fav"
        :class="{ 'filters__fav--active': props.favOnly }"
        :aria-pressed="props.favOnly"
        @click="emit('update:favOnly', !props.favOnly)"
      >
        <UIcon
          name="i-lucide-heart"
          class="filters__fav-icon"
        />
        Favorites
        <span class="filters__count">{{ props.favCount }}</span>
      </button>
    </div>

    <div class="filters__section">
      <p class="filters__label">
        Source
      </p>
      <div
        class="filters__toggle"
        role="group"
        aria-label="Source"
      >
        <button
          type="button"
          class="filters__toggle-btn"
          :class="{ 'filters__toggle-btn--active': props.source === EXPLORE_SOURCE_LIVE }"
          :aria-pressed="props.source === EXPLORE_SOURCE_LIVE"
          @click="emit('update:source', EXPLORE_SOURCE_LIVE)"
        >
          <span class="filters__live-dot" />
          Live
        </button>
        <button
          type="button"
          class="filters__toggle-btn"
          :class="{ 'filters__toggle-btn--active': props.source === EXPLORE_SOURCE_CACHED }"
          :aria-pressed="props.source === EXPLORE_SOURCE_CACHED"
          @click="emit('update:source', EXPLORE_SOURCE_CACHED)"
        >
          All
        </button>
      </div>
    </div>

    <div class="filters__section">
      <p class="filters__label">
        Sort by
      </p>
      <USelect
        v-model="sortModel"
        value-key="value"
        :items="sortItems"
        :ui="sortSelectUi"
        class="w-full"
      />
    </div>

    <div class="filters__section">
      <p class="filters__label">
        Search
      </p>
      <UInput
        v-model="qLocal"
        icon="i-lucide-search"
        placeholder="Any keyword"
        :ui="{ root: 'w-full' }"
        size="md"
      />
    </div>

    <div class="filters__section">
      <p class="filters__label">
        Country
      </p>
      <USelectMenu
        v-model="countriesModel"
        multiple
        value-key="value"
        :items="countryItems"
        :loading="props.facetsLoading"
        placeholder="Any country"
        :search-input="{ placeholder: 'Filter countries…' }"
        class="w-full"
      >
        <template #item-label="{ item }">
          {{ item.label }}
        </template>
        <template #item-trailing="{ item }">
          <span class="filters__count">{{ item.count }}</span>
        </template>
      </USelectMenu>
    </div>

    <div class="filters__section">
      <p class="filters__label">
        City
      </p>
      <USelectMenu
        v-model="citiesModel"
        multiple
        value-key="value"
        :items="cityItems"
        :loading="props.facetsLoading"
        placeholder="Any city"
        :search-input="{ placeholder: 'Filter cities…' }"
        class="w-full"
      >
        <template #item-label="{ item }">
          {{ item.label }}
        </template>
        <template #item-trailing="{ item }">
          <span class="filters__count">{{ item.count }}</span>
        </template>
      </USelectMenu>
    </div>

    <div class="filters__section">
      <p class="filters__label">
        ISP / Org
      </p>
      <USelectMenu
        v-model="orgsModel"
        multiple
        value-key="value"
        :items="orgItems"
        :loading="props.facetsLoading"
        placeholder="Any ISP"
        :search-input="{ placeholder: 'Filter ISPs…' }"
        class="w-full"
      >
        <template #item-label="{ item }">
          {{ item.label }}
        </template>
        <template #item-trailing="{ item }">
          <span class="filters__count">{{ item.count }}</span>
        </template>
      </USelectMenu>
    </div>

    <div class="filters__section">
      <p class="filters__label">
        Manufacturer
      </p>
      <USelectMenu
        v-model="manufacturersModel"
        multiple
        value-key="value"
        :items="manufacturerItems"
        :loading="props.facetsLoading"
        placeholder="Any manufacturer"
        :search-input="{ placeholder: 'Filter manufacturers…' }"
        class="w-full"
      >
        <template #item-label="{ item }">
          {{ item.label }}
        </template>
        <template #item-trailing="{ item }">
          <span class="filters__count">{{ item.count }}</span>
        </template>
      </USelectMenu>
    </div>

    <button
      v-if="hasActiveFilters"
      type="button"
      class="filters__clear"
      @click="emit('clear')"
    >
      <UIcon name="i-lucide-x" />
      Clear all filters
    </button>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.filters__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filters__label {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-dim, #8b9591);
}

.filters__toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
}

.filters__toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 10px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--text-dim, #8b9591);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.filters__toggle-btn--active {
  background: rgb(var(--phosphor-rgb) / 0.14);
  color: var(--phosphor-bright);
}

.filters__fav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  background: rgba(0, 0, 0, 0.35);
  color: var(--text-dim, #8b9591);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.filters__fav:hover {
  color: var(--text, #f4f6f5);
}

.filters__fav--active {
  background: rgb(var(--phosphor-rgb) / 0.14);
  color: var(--phosphor-bright);
}

.filters__fav-icon {
  width: 14px;
  height: 14px;
}

.filters__fav .filters__count {
  margin-left: auto;
}

.filters__live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentcolor;
}

.filters__count {
  font-size: 11px;
  color: var(--text-mute, #58615d);
  font-variant-numeric: tabular-nums;
}

.filters__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px;
  border-radius: 9px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: var(--text-dim, #8b9591);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 140ms ease, color 140ms ease;
}

.filters__clear:hover {
  border-color: var(--phosphor-soft);
  color: var(--phosphor-bright);
}
</style>
