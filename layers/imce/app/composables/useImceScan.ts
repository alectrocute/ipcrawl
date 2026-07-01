import type { ImceNearbyResponse } from '#shared/imce'
import { IMCE_SCAN_ZOOM } from '#shared/imce'
import type { MapInitialView, MapMarker, MapResponse, MapViewChange } from '#shared/map'
import { clampLat, clampLon, clampZoom, snapBounds } from '#shared/map'
import { API_IMCE_NEARBY, API_MAP_POINTS } from '#shared/routes'

/**
 * The scan walks a small state machine:
 *
 *   locating ──► scanning ──► result            (happy path)
 *      └────► denied | unsupported | error
 *
 * `locating` is up while the browser's permission prompt / geolocation resolves.
 */
export type ImcePhase = 'locating' | 'scanning' | 'result' | 'denied' | 'unsupported' | 'error'

/** Automatic retries for transient geolocation failures before surfacing an error. */
const IMCE_GEO_ERROR_RETRIES = 2
const IMCE_GEO_ERROR_RETRY_MS = 1500

/** Phases where a permission grant (or reset to "ask") should re-trigger the scan. */
function isAwaitingPermission(phase: ImcePhase): boolean {
  return phase === 'denied' || phase === 'error'
}

/**
 * Owns geolocation + both data feeds for the /imce page:
 *
 *  - the alert ("are there cameras within your city") via /api/imce/nearby,
 *    a one-shot radius scan keyed to the visitor's coordinate;
 *  - the pannable map markers via /api/map/points, refetched on every settled
 *    pan/zoom exactly like the main map, so the scan map is fully explorable.
 *
 * Both feeds run client-side only (the page renders nothing until we have a
 * location), so there's no SSR/hydration surface to reconcile here.
 */
export function useImceScan() {
  const phase = ref<ImcePhase>('locating')
  const errorMessage = ref<string | null>(null)
  const userLocation = ref<{ lat: number, lng: number } | null>(null)
  const initialView = ref<MapInitialView | null>(null)

  const nearby = ref<ImceNearbyResponse | null>(null)
  const markers = ref<MapMarker[]>([])
  const mapLoading = ref(false)

  // The map is on screen for both `scanning` and `result` — i.e. as soon as a
  // location exists. Pre-location phases show the veil instead.
  const mapVisible = computed(() => initialView.value !== null)

  // Monotonic request token: a fast pan can outrun an earlier in-flight points
  // fetch, so stale responses are dropped rather than clobbering fresh markers.
  let pointsReqId = 0

  async function loadPoints(view: MapViewChange): Promise<void> {
    if (!import.meta.client) return
    const zoom = clampZoom(view.zoom)
    const bounds = snapBounds(view.bounds, zoom)
    const reqId = ++pointsReqId
    mapLoading.value = true
    try {
      const res = await $fetch<MapResponse>(API_MAP_POINTS, {
        query: { w: bounds.w, s: bounds.s, e: bounds.e, n: bounds.n, z: zoom }
      })
      if (reqId !== pointsReqId) return
      markers.value = res.markers
    } catch {
      // Keep the last good markers; the base map still renders.
    } finally {
      if (reqId === pointsReqId) mapLoading.value = false
    }
  }

  async function loadNearby(lat: number, lng: number): Promise<void> {
    try {
      nearby.value = await $fetch<ImceNearbyResponse>(API_IMCE_NEARBY, {
        query: { lat, lon: lng }
      })
    } catch {
      // The endpoint already degrades to an empty result server-side; a thrown
      // error here (e.g. 429) leaves the panel in its reassuring empty state.
      nearby.value = null
    }
  }

  function onViewChange(view: MapViewChange): void {
    void loadPoints(view)
  }

  let geoRetryTimer: ReturnType<typeof setTimeout> | undefined
  let geoAttemptId = 0
  let geoErrorRetries = 0
  let permissionStatus: PermissionStatus | null = null

  function clearGeoRetryTimer(): void {
    if (geoRetryTimer !== undefined) {
      clearTimeout(geoRetryTimer)
      geoRetryTimer = undefined
    }
  }

  function onGeoSuccess(pos: GeolocationPosition, attemptId: number): void {
    if (attemptId !== geoAttemptId) return
    clearGeoRetryTimer()
    geoErrorRetries = 0

    const lat = clampLat(pos.coords.latitude)
    const lng = clampLon(pos.coords.longitude)
    userLocation.value = { lat, lng }
    initialView.value = { lat, lng, zoom: IMCE_SCAN_ZOOM }
    phase.value = 'scanning'
    // The map's first viewchange (on ready) kicks off loadPoints; the
    // radius scan runs in parallel and gates the flip to `result`.
    loadNearby(lat, lng).finally(() => {
      if (attemptId !== geoAttemptId) return
      phase.value = 'result'
    })
  }

  function scheduleGeoRetry(attemptId: number): void {
    clearGeoRetryTimer()
    geoRetryTimer = setTimeout(() => {
      geoRetryTimer = undefined
      if (attemptId !== geoAttemptId) return
      requestLocation()
    }, IMCE_GEO_ERROR_RETRY_MS)
  }

  function onGeoError(err: GeolocationPositionError, attemptId: number): void {
    if (attemptId !== geoAttemptId) return

    if (err.code === err.PERMISSION_DENIED) {
      clearGeoRetryTimer()
      geoErrorRetries = 0
      phase.value = 'denied'
      return
    }

    const transient = err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE
    if (transient && geoErrorRetries < IMCE_GEO_ERROR_RETRIES) {
      geoErrorRetries++
      phase.value = 'locating'
      scheduleGeoRetry(attemptId)
      return
    }

    clearGeoRetryTimer()
    geoErrorRetries = 0
    phase.value = 'error'
    errorMessage.value = err.code === err.TIMEOUT
      ? 'Locating you took too long. Check your signal and try again.'
      : 'We couldn\'t pin down your location. Try again in a moment.'
  }

  function requestLocation(): void {
    clearGeoRetryTimer()
    const attemptId = ++geoAttemptId
    phase.value = 'locating'
    errorMessage.value = null

    if (!import.meta.client || typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      phase.value = 'unsupported'
      return
    }

    navigator.geolocation.getCurrentPosition(
      pos => onGeoSuccess(pos, attemptId),
      err => onGeoError(err, attemptId),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    )
  }

  function maybeRetryFromPermission(): void {
    if (!permissionStatus || mapVisible.value) return
    if (!isAwaitingPermission(phase.value)) return

    const { state } = permissionStatus
    if (state === 'granted' || state === 'prompt') requestLocation()
  }

  function onPermissionChange(): void {
    maybeRetryFromPermission()
  }

  async function bindPermissionListener(): Promise<void> {
    if (!import.meta.client || !navigator.permissions?.query) return
    try {
      permissionStatus = await navigator.permissions.query({ name: 'geolocation' })
      permissionStatus.onchange = onPermissionChange
    } catch {
      // Permissions API unavailable for geolocation in this browser — fall
      // back to manual retry only.
    }
  }

  function onVisible(): void {
    if (document.visibilityState !== 'visible') return
    maybeRetryFromPermission()
  }

  function locate(): void {
    requestLocation()
  }

  onMounted(() => {
    void bindPermissionListener()
    requestLocation()
    document.addEventListener('visibilitychange', onVisible)
  })

  onBeforeUnmount(() => {
    clearGeoRetryTimer()
    geoAttemptId++
    document.removeEventListener('visibilitychange', onVisible)
    if (permissionStatus) permissionStatus.onchange = null
  })

  return {
    phase,
    errorMessage,
    userLocation,
    initialView,
    mapVisible,
    nearby,
    markers,
    mapLoading,
    onViewChange,
    locate
  }
}
