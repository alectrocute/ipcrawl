<script setup lang="ts">
import type { ExploreCamCard, ExploreFacets, ExploreListResponse } from '#shared/explore'
import { EXPLORE_SORT_RECENT, EXPLORE_SOURCE_LIVE } from '#shared/explore'
import { API_EXPLORE_CAMS, API_EXPLORE_FACETS, apiExploreCamPath } from '#shared/routes'

defineOptions({ name: 'ExplorePage' })

// --- Filters (URL-synced) + dialog (?cam= route) ------------------------------
const filters = useExploreFilters()
const { pageSize, page, favOnly, favoriteCount, q, source, sort, countries, cities, orgs, manufacturers } = filters
const dialog = await useExploreCamDialog()

// --- Data ---------------------------------------------------------------------
const { data: list, status: listStatus } = await useFetch<ExploreListResponse>(API_EXPLORE_CAMS, {
  query: filters.listQuery,
  default: () => ({ items: [], total: 0, page: 1, pageSize })
})
const { data: facets, status: facetsStatus } = await useFetch<ExploreFacets>(API_EXPLORE_FACETS, {
  query: filters.facetsQuery,
  default: (): ExploreFacets => ({ countries: [], cities: [], orgs: [], manufacturers: [] })
})

const listLoading = computed(() => listStatus.value === 'pending')
const facetsLoading = computed(() => facetsStatus.value === 'pending')

// --- Featured / hero stream ---------------------------------------------------
// An env-pinned cam (NUXT_PUBLIC_FEATURED_CAM_ID) is fetched on its own so it
// can be showcased even when it isn't on page 1; with no override we feature
// page 1's first result. Either way the hero only shows on page 1.
const featuredCamId = (useRuntimeConfig().public as { featuredCamId?: string }).featuredCamId?.trim()
const { data: featuredOverride } = await useAsyncData<ExploreCamCard | null>(
  'explore-featured-cam',
  () => (featuredCamId
    ? $fetch<ExploreCamCard>(apiExploreCamPath(featuredCamId)).catch(() => null)
    : Promise.resolve(null)),
  { default: () => null }
)

// useFetch resets `data` to its default between requests, which would flash the
// grid's empty state on every filter/page change. Keep the last *successful*
// page on screen (dimmed while pending) and only swap when fresh data lands.
const displayItems = ref<ExploreCamCard[]>(list.value?.items ?? [])
const displayTotal = ref<number>(list.value?.total ?? 0)
watch(listStatus, (s) => {
  if (s === 'success' && list.value) {
    displayItems.value = list.value.items
    displayTotal.value = list.value.total
    applyPendingDialogStep()
  }
})

// The hero only earns its spot in the pure default view. Any deviation —
// search, facet selections, favorites-only, the live-source toggle, or a
// non-default sort — means the viewer is hunting for something specific, so the
// hero would just be noise. Broader than FilterSidebar's "active filters" since
// it also counts the sort.
const hasActiveFilters = computed(() =>
  source.value === EXPLORE_SOURCE_LIVE
  || sort.value === EXPLORE_SORT_RECENT
  || favOnly.value
  || countries.value.length > 0
  || cities.value.length > 0
  || orgs.value.length > 0
  || manufacturers.value.length > 0
  || q.value.length > 0
)

// Hero shows on page 1 only, and only when an env override cam is configured
// (and resolved). With no override there is no featured card at all. It's also
// hidden whenever a filter is active. The featured cam is dropped from the grid
// so it isn't shown twice.
const featured = computed<ExploreCamCard | null>(() => {
  if (page.value !== 1 || hasActiveFilters.value) return null
  return featuredOverride.value
})
const gridItems = computed(() => {
  const f = featured.value
  return f ? displayItems.value.filter(card => card.id !== f.id) : displayItems.value
})

// Self-heal an out-of-range page (a deep-linked ?page=N past the end, or a
// filter that shrank the result set): snap to page 1 instead of stranding the
// viewer on an empty page that still reports a non-zero total. The watch covers
// later refetches; onMounted covers an out-of-range deep link (where status is
// already 'success' at hydration and never transitions).
function healOutOfRangePage() {
  if (list.value && list.value.total > 0 && list.value.items.length === 0 && page.value > 1) {
    filters.commit({ page: undefined }, { replace: true })
  }
}
watch(listStatus, (s) => {
  if (s === 'success') healOutOfRangePage()
})
onMounted(healOutOfRangePage)

// --- Pagination ----------------------------------------------------------------
const scroller = ref<HTMLElement | null>(null)
const pageCount = computed(() => Math.max(1, Math.ceil(displayTotal.value / pageSize)))

function setPage(value: number) {
  filters.commit({ page: value > 1 ? value : undefined })
  scroller.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

// --- Dialog arrow navigation -----------------------------------------------
// With the dialog open, left/right step through the current page's cards.
// Stepping off either edge flips the page; the boundary card of the fresh
// list is opened once it lands (see `applyPendingDialogStep`). All of it uses
// replace-navigation so Back still closes the dialog in one step.
let pendingDialogStep: 'first' | 'last' | null = null

function applyPendingDialogStep() {
  if (!pendingDialogStep) return
  const step = pendingDialogStep
  pendingDialogStep = null
  if (!dialog.open.value || displayItems.value.length === 0) return
  const target = step === 'first'
    ? displayItems.value[0]!
    : displayItems.value[displayItems.value.length - 1]!
  dialog.openCam(target.id, { replace: true })
}

function stepDialogCam(dir: 1 | -1) {
  // A page flip is already in flight — let it land instead of stacking steps.
  if (listLoading.value || pendingDialogStep) return
  const items = displayItems.value
  const idx = items.findIndex(card => card.id === dialog.camId.value)
  if (idx === -1) return

  const next = idx + dir
  if (next >= 0 && next < items.length) {
    dialog.openCam(items[next]!.id, { replace: true })
    return
  }

  if (dir === 1 && page.value < pageCount.value) {
    pendingDialogStep = 'first'
  } else if (dir === -1 && page.value > 1) {
    pendingDialogStep = 'last'
  } else {
    return
  }
  const nextPage = page.value + dir
  filters.commit({ page: nextPage > 1 ? nextPage : undefined }, { replace: true })
  scroller.value?.scrollTo({ top: 0 })
}

// Left/right arrows page the grid, or step through cams while the dialog is
// open. Skip when the filters overlay is up or the user is typing in a field
// so we don't hijack normal text navigation.
function onArrowKeys(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
  if (mobileFiltersOpen.value) return

  const el = e.target as HTMLElement | null
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return

  const dir = e.key === 'ArrowRight' ? 1 : -1

  if (dialog.open.value) {
    e.preventDefault()
    stepDialogCam(dir)
    return
  }

  if (dir === 1 && page.value < pageCount.value) {
    e.preventDefault()
    setPage(page.value + 1)
  } else if (dir === -1 && page.value > 1) {
    e.preventDefault()
    setPage(page.value - 1)
  }
}

onMounted(() => window.addEventListener('keydown', onArrowKeys))
onBeforeUnmount(() => window.removeEventListener('keydown', onArrowKeys))

// --- Sidebar (rendered twice: desktop aside + mobile slideover) -----------------
const mobileFiltersOpen = ref(false)

const sidebarBindings = computed(() => ({
  'source': source.value,
  'sort': sort.value,
  'countries': countries.value,
  'cities': cities.value,
  'orgs': orgs.value,
  'manufacturers': manufacturers.value,
  'q': q.value,
  'facets': facets.value,
  'facetsLoading': facetsLoading.value,
  'favOnly': favOnly.value,
  'favCount': favoriteCount.value,
  'onUpdate:source': filters.setSource,
  'onUpdate:sort': filters.setSort,
  'onUpdate:countries': filters.setCountries,
  'onUpdate:cities': filters.setCities,
  'onUpdate:orgs': filters.setOrgs,
  'onUpdate:manufacturers': filters.setManufacturers,
  'onUpdate:q': filters.setQ,
  'onUpdate:favOnly': filters.setFavOnly,
  'onClear': filters.clearAll
}))

useSeoMeta({
  title: () => (dialog.detail.value?.location ? `${dialog.detail.value.location} — IP Crawl` : 'IP Crawl'),
  description: 'Browse, filter and live-preview open webcams from around the world.',
  ogTitle: () => (dialog.detail.value?.location ? `${dialog.detail.value.location} — IP Crawl` : 'IP Crawl — open webcam catalog'),
  ogDescription: 'A filterable, live dashboard for exploring video-feed data.'
})
</script>

<template>
  <div
    ref="scroller"
    class="explore"
  >
    <div class="explore__inner">
      <header class="explore__header">
        <IpcrawlLogo />

        <div class="explore__header-end">
          <p class="explore__count">
            <span class="explore__count-num">{{ displayTotal.toLocaleString() }}</span> cameras
          </p>
          <UButton
            to="/map"
            icon="i-lucide-map-pin"
            color="neutral"
            variant="ghost"
            size="sm"
            class="explore__about-button explore__map-button ml-2"
          >
            Map
          </UButton>
          <UButton
            to="/stats"
            icon="i-lucide-bar-chart"
            color="neutral"
            variant="ghost"
            size="sm"
            class="explore__about-button"
          >
            Stats
          </UButton>
          <UButton
            class="explore__mobile-filters"
            color="neutral"
            variant="subtle"
            size="sm"
            @click="mobileFiltersOpen = true"
          >
            <UIcon
              name="i-lucide-sliders-horizontal"
              class="explore__mobile-filters-icon"
            />
          </UButton>
          <UButton
            to="/about"
            icon="i-lucide-info"
            color="neutral"
            variant="ghost"
            size="sm"
            class="explore__about-button"
          >
            About
          </UButton>
        </div>
      </header>

      <div class="explore__layout">
        <aside class="explore__sidebar">
          <ExploreSyncCountdown :only-within-ms="4 * 60 * 60 * 1000" />
          <ExploreAboutCard />
          <ImceCtaCard />
          <div class="explore__sidebar-card">
            <ExploreFilterSidebar v-bind="sidebarBindings" />
          </div>
        </aside>

        <main class="explore__main">
          <ExploreFeaturedCam
            v-if="featured"
            :card="featured"
            @select="card => dialog.openCam(card.id)"
          />
          <ExploreCamGrid
            :items="gridItems"
            :total="displayTotal"
            :loading="listLoading"
            :skeleton-count="pageSize"
            @select="card => dialog.openCam(card.id)"
          />
          <ExplorePaginationBar
            :page="page"
            :page-size="pageSize"
            :total="displayTotal"
            @update:page="setPage"
          />
        </main>
      </div>
    </div>

    <USlideover
      v-model:open="mobileFiltersOpen"
      title="Filters"
      side="left"
    >
      <template #body>
        <ExploreFilterSidebar v-bind="sidebarBindings" />
      </template>
      <template #footer>
        <nav class="explore__mobile-nav">
          <UButton
            to="/about"
            icon="i-lucide-info"
            color="neutral"
            variant="ghost"
            block
          >
            About
          </UButton>
          <UButton
            to="/stats"
            icon="i-lucide-bar-chart"
            color="neutral"
            variant="ghost"
            block
          >
            Stats
          </UButton>
          <UButton
            to="/map"
            icon="i-lucide-map-pin"
            color="neutral"
            variant="ghost"
            block
            class="explore__map-button"
          >
            Map
          </UButton>
          <ImceCtaCard />
        </nav>
      </template>
    </USlideover>

    <ExploreCamDialog
      :open="dialog.open.value"
      :detail="dialog.displayDetail.value"
      :loading="dialog.loading.value"
      @update:open="dialog.setOpen"
    />
  </div>
</template>

<style scoped>
/* The base app pins body to a fixed, non-scrolling fullscreen surface (built
   for the CRT roulette). The explorer is a scrollable dashboard, so it owns its
   own scroll context and re-enables touch panning that body disables. */
.explore {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.explore__inner {
  max-width: 1600px;
  margin: 0 auto;
  padding: clamp(12px, 1.6vw, 18px) clamp(14px, 3vw, 40px) 80px;
  /* Route-change morph: the 1600px dashboard column condenses into the
     narrow about/stats columns (and back). See main.css for choreography. */
  view-transition-name: page-shell;
}

.explore__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: clamp(10px, 1.4vw, 14px);
  margin-bottom: clamp(16px, 2vw, 24px);
  border-bottom: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  /* The header bar (and its hairline) stretches between page widths. */
  view-transition-name: page-header;
}

.explore__header-end {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.explore__count {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim, #8b9591);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.explore__count-num {
  color: var(--phosphor);
  font-weight: 600;
}

/* The map is a marquee feature, so the button wears the same phosphor "powered
   on" treatment as the Console Mode link: tinted fill and a phosphor border. */
.explore__map-button {
  color: var(--phosphor-bright);
  border: 1px solid var(--phosphor-soft);
  background:
    linear-gradient(180deg, rgb(var(--phosphor-rgb) / 0.14) 0%, rgb(var(--phosphor-rgb) / 0.05) 100%),
    var(--glass, rgba(12, 17, 16, 0.55));
  transition: border-color 160ms ease;
}

.explore__map-button:hover {
  color: var(--phosphor-bright);
  border-color: var(--phosphor);
  background:
    linear-gradient(180deg, rgb(var(--phosphor-rgb) / 0.2) 0%, rgb(var(--phosphor-rgb) / 0.08) 100%),
    var(--glass, rgba(12, 17, 16, 0.55));
}

.explore__mobile-filters {
  display: none;
}

.explore__mobile-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.explore__layout {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  gap: clamp(20px, 3vw, 38px);
  align-items: start;
}

.explore__sidebar {
  position: sticky;
  top: clamp(12px, 1.6vw, 18px);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.explore__sidebar-card {
  padding: 18px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  /* No backdrop-filter on a sticky surface: the grid scrolls beneath it, so a
     blur here re-filters that region on every scrolled frame. The stronger
     glass tint gives the same depth without the per-frame cost. */
  background: var(--glass-strong, rgba(7, 11, 10, 0.82));
}

.explore__main {
  min-width: 0;
}

@media (max-width: 900px) {
  .explore__layout {
    grid-template-columns: 1fr;
  }

  .explore__sidebar {
    display: none;
  }

  .explore__mobile-filters {
    display: inline-flex;
  }

  .explore__about-button {
    display: none;
  }
}
</style>
