import type { ExploreSource } from '#shared/explore'
import { EXPLORE_SOURCE_CACHED, EXPLORE_SOURCE_LIVE } from '#shared/explore'
import type { MapBounds, MapInitialView, MapResponse, MapViewChange } from '#shared/map'
import {
  clampZoom,
  MAP_DEFAULT_VIEW,
  MAP_MAX_LAT,
  snapBounds,
  toQueryNum
} from '#shared/map'
import { API_MAP_POINTS } from '#shared/routes'

// Re-exported for the canvas (which imports these from here) and any other
// consumer that historically reached for the composable's view types.
export type { MapInitialView, MapViewChange }

/**
 * Orchestrates the map's data: the viewport the canvas reports → the snapped
 * bbox the API is asked for → the markers handed back to the canvas. Filters
 * (source + any country/city/org/q carried over from the catalogue URL) are
 * snapshotted once at setup so they seed the view without coupling refetches to
 * unrelated query-param churn (e.g. the ?cam= dialog toggling).
 *
 * Kept out of the SFC on purpose: the page is the only route component, the
 * canvas stays purely presentational, and all fetch/LOD logic lives here.
 */
export function useMapExplorer() {
  const route = useRoute()
  const router = useRouter()

  // Initial map placement comes from the URL when present (so a deep link frames
  // the same spot), else a centred world view for SSR first paint.
  const initialView: MapInitialView = {
    lat: Math.min(MAP_MAX_LAT, Math.max(-MAP_MAX_LAT, toQueryNum(route.query.lat, MAP_DEFAULT_VIEW.lat))),
    lng: Math.min(180, Math.max(-180, toQueryNum(route.query.lng, MAP_DEFAULT_VIEW.lng))),
    zoom: clampZoom(toQueryNum(route.query.z, MAP_DEFAULT_VIEW.zoom))
  }

  // One-time snapshot of catalogue filters carried in via the URL.
  const filterSnapshot = {
    country: toArr(route.query.country),
    city: toArr(route.query.city),
    org: toArr(route.query.org),
    q: typeof route.query.q === 'string' ? route.query.q : ''
  }
  const source = ref<ExploreSource>(
    route.query.source === EXPLORE_SOURCE_LIVE ? EXPLORE_SOURCE_LIVE : EXPLORE_SOURCE_CACHED
  )

  // The fetch view: a snapped bbox + zoom. Seeded to the whole world so SSR has
  // markers before Leaflet (client-only) can report real bounds; the canvas
  // emits its true viewport on mount and refines this.
  const fetchView = ref<{ bounds: MapBounds, zoom: number }>({
    bounds: snapBounds({ w: -180, s: -MAP_MAX_LAT, e: 180, n: MAP_MAX_LAT }, initialView.zoom),
    zoom: initialView.zoom
  })

  const query = computed(() => ({
    w: fetchView.value.bounds.w,
    s: fetchView.value.bounds.s,
    e: fetchView.value.bounds.e,
    n: fetchView.value.bounds.n,
    z: fetchView.value.zoom,
    source: source.value,
    country: filterSnapshot.country,
    city: filterSnapshot.city,
    org: filterSnapshot.org,
    q: filterSnapshot.q || undefined
  }))

  const { data, status } = useFetch<MapResponse>(API_MAP_POINTS, {
    query,
    default: (): MapResponse => ({ markers: [], total: 0, truncated: false, zoom: initialView.zoom })
  })

  const markers = computed(() => data.value?.markers ?? [])
  const total = computed(() => data.value?.total ?? 0)
  const truncated = computed(() => data.value?.truncated ?? false)
  const loading = computed(() => status.value === 'pending')

  // Canvas → here on every settled pan/zoom. Snapping makes most nudges no-ops
  // for the request (cache hits); the URL center sync is replace-only so it
  // stays shareable without spamming history or perturbing the request.
  function onViewChange(v: MapViewChange) {
    const zoom = clampZoom(v.zoom)
    fetchView.value = { bounds: snapBounds(v.bounds, zoom), zoom }
    router.replace({
      query: {
        ...route.query,
        lat: v.center.lat.toFixed(4),
        lng: v.center.lng.toFixed(4),
        z: String(zoom)
      }
    })
  }

  function setSource(next: ExploreSource) {
    source.value = next
  }

  return {
    initialView,
    markers,
    total,
    truncated,
    loading,
    source,
    setSource,
    onViewChange
  }
}

function toArr(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  return typeof value === 'string' && value ? [value] : []
}
