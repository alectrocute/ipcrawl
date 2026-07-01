<script setup lang="ts">
import type { Map as LeafletMap, LayerGroup, Marker } from 'leaflet'
import type { MapMarker } from '#shared/map'
import type { MapInitialView, MapViewChange } from '../../composables/useMapExplorer'
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, MAP_STACK_ZOOM } from '#shared/map'

defineOptions({ name: 'MapCanvas' })

interface Props {
  markers: MapMarker[]
  initialView: MapInitialView
  /**
   * Optional "you are here" pin (the IMCE scan supplies the visitor's location).
   * Lives on its own marker above the camera layer so a marker refresh never
   * clears it.
   */
  userLocation?: { lat: number, lng: number } | null
  /** True while the explore cam dialog is open (used to restore stack pickers on close). */
  camOpen?: boolean
}
const props = withDefaults(defineProps<Props>(), { userLocation: null, camOpen: false })
const emit = defineEmits<{
  viewchange: [view: MapViewChange]
  select: [id: string]
}>()

// Dark basemap *with* place labels (replaces the old presentational SVG world).
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION
  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

const CAM_PIN_SIZE = 52
const CAM_PIN_TAIL = 8

const el = useTemplateRef<HTMLDivElement>('el')
const instance = getCurrentInstance()

/**
 * Resolve the leaflet container element. On a fresh client-side mount the
 * template ref is bound by the time `onMounted` runs, but on the SSR hydration
 * path Nuxt's client-only (`createClientOnly`) wrapper mounts this component a
 * tick later and the root template ref is still null in `onMounted` — so we
 * also wait a tick and fall back to the instance's own root node. Without this,
 * a hard load of /map silently no-ops and the map never appears.
 */
async function resolveContainer(): Promise<HTMLElement | null> {
  if (el.value) return el.value
  await nextTick()
  if (el.value) return el.value
  const root = instance?.vnode?.el ?? instance?.proxy?.$el
  return root instanceof HTMLElement ? root : null
}

let map: LeafletMap | null = null
let layer: LayerGroup | null = null
// The visitor's own pin, kept off `layer` so a camera-marker refresh leaves it
// untouched.
let userMarker: Marker | null = null
// Bound at runtime from the dynamic import so the leaflet module (and its
// window/document access) never enters the SSR/server bundle.
let L: typeof import('leaflet') | null = null
// Stack picker to restore after the cam dialog closes (set when a tile is chosen).
let pendingStackGroup: MapMarker[] | null = null
let closingStackForCam = false

function emitView() {
  if (!map) return
  const b = map.getBounds()
  emit('viewchange', {
    bounds: { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() },
    center: { lat: map.getCenter().lat, lng: map.getCenter().lng },
    zoom: map.getZoom()
  })
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

function clusterSize(count: number): number {
  return Math.round(Math.max(34, Math.min(56, 28 + Math.sqrt(count) * 5)))
}

function clusterFontSize(size: number): number {
  return Math.round(Math.max(10, Math.min(14, size * 0.3)))
}

function buildIcon(m: MapMarker) {
  if (!L) return undefined
  if (m.count === 1) {
    const live = m.live ? '<span class="map-pin__dot"></span>' : ''
    return L.divIcon({
      className: 'map-pin-wrap',
      html: `<div class="map-pin map-pin--cam">
        <img class="map-pin__thumb" src="${m.thumb}" loading="lazy" alt="" referrerpolicy="no-referrer">
        ${live}
      </div>`,
      iconSize: [CAM_PIN_SIZE, CAM_PIN_SIZE + CAM_PIN_TAIL],
      iconAnchor: [CAM_PIN_SIZE / 2, CAM_PIN_SIZE + CAM_PIN_TAIL]
    })
  }
  const size = clusterSize(m.count)
  const liveClass = m.live ? ' map-pin--live' : ''
  const fontSize = clusterFontSize(size)
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-pin map-pin--cluster${liveClass}" style="width:${size}px;height:${size}px;font-size:${fontSize}px">
      <span class="map-pin__count">${formatCount(m.count)}</span>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  })
}

// A "stack": multiple cameras pinned to one exact coordinate (an IP-geolocation
// artifact). Shown as a single cam thumbnail with a count badge; clicking opens
// a picker of its members.
function buildStackIcon(group: MapMarker[]) {
  if (!L) return undefined
  const first = group[0]!
  const live = group.some(m => m.live) ? '<span class="map-pin__dot"></span>' : ''
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-pin map-pin--cam map-pin--stack">
      <img class="map-pin__thumb" src="${first.thumb}" loading="lazy" alt="" referrerpolicy="no-referrer">
      ${live}
      <span class="map-pin__stack-count">${formatCount(group.length)}</span>
    </div>`,
    iconSize: [CAM_PIN_SIZE, CAM_PIN_SIZE + CAM_PIN_TAIL],
    iconAnchor: [CAM_PIN_SIZE / 2, CAM_PIN_SIZE + CAM_PIN_TAIL]
  })
}

// Picker for a co-located stack: a scrollable thumbnail grid (works for 2 or
// 300) where each tile opens that camera's dialog.
function openStackPopup(group: MapMarker[]) {
  if (!map || !L) return
  const first = group[0]!

  const wrap = document.createElement('div')
  wrap.className = 'map-stack'

  const title = document.createElement('p')
  title.className = 'map-stack__title'
  title.textContent = `${group.length} cameras here`
  wrap.appendChild(title)

  const grid = document.createElement('div')
  grid.className = 'map-stack__grid'
  for (const m of group) {
    if (!m.id) continue
    const id = m.id
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'map-stack__item'
    btn.setAttribute('aria-label', 'Open camera')
    const img = document.createElement('img')
    img.src = m.thumb || ''
    img.loading = 'lazy'
    img.alt = ''
    img.referrerPolicy = 'no-referrer'
    btn.appendChild(img)
    btn.addEventListener('click', () => {
      pendingStackGroup = group
      closingStackForCam = true
      emit('select', id)
      map?.closePopup()
    })
    grid.appendChild(btn)
  }
  wrap.appendChild(grid)

  const popup = L.popup({
    className: 'map-stack-popup',
    maxWidth: 380,
    // Clear the floating header (top) so the picker is never tucked under it.
    autoPanPaddingTopLeft: [24, 88],
    autoPanPaddingBottomRight: [24, 32]
  })
    .setLatLng([first.lat, first.lon])
    .setContent(wrap)

  popup.on('remove', () => {
    if (closingStackForCam) {
      closingStackForCam = false
      return
    }
    pendingStackGroup = null
  })

  popup.openOn(map!)
}

// Cluster tap → frame the cell's *actual* extent in a single move so it splits
// right away, instead of nudging the zoom by a fixed step and forcing the user
// to re-tap the same bubble over and over. A cluster spread across a region
// zooms just enough to break into sub-clusters; a tightly packed one zooms to
// the cap where the refetch resolves it into individual pins. A truly
// co-located group (one coordinate, no zoom can separate it) jumps straight to
// the stack-pin LOD so it surfaces as a "N cameras here" picker.
function drillCluster(m: MapMarker) {
  if (!map || !L) return
  const colocated = m.minLat === m.maxLat && m.minLon === m.maxLon
  if (colocated) {
    map.flyTo([m.lat, m.lon], MAP_STACK_ZOOM, { duration: 0.6 })
    return
  }
  map.flyToBounds(L.latLngBounds([[m.minLat, m.minLon], [m.maxLat, m.maxLon]]), {
    maxZoom: MAP_MAX_ZOOM,
    // Keep the framed cameras clear of the floating header (top) and the
    // zoom/attribution chrome (bottom).
    paddingTopLeft: [40, 96],
    paddingBottomRight: [40, 48],
    duration: 0.6
  })
}

function renderMarkers() {
  if (!map || !layer || !L) return
  layer.clearLayers()

  // Fold markers sharing an exact coordinate into one entry. Below MAP_STACK_ZOOM
  // the server returns aggregated grid cells (centroids or singletons), so each
  // incoming marker position is unique and groups are size 1. At/above the stack
  // threshold the server emits raw per-camera pins; IP-geolocation duplicates
  // then produce groups > 1 that we render as a single "N cameras here" pin with
  // a picker — the only way to reach cams that no amount of zoom can separate.
  const groups = new Map<string, MapMarker[]>()
  for (const m of props.markers) {
    const key = `${m.lat},${m.lon}`
    const g = groups.get(key)
    if (g) g.push(m)
    else groups.set(key, [m])
  }

  for (const group of groups.values()) {
    if (group.length > 1) {
      const first = group[0]!
      const stack = L.marker([first.lat, first.lon], {
        icon: buildStackIcon(group),
        keyboard: false,
        zIndexOffset: 1100
      })
      stack.on('click', () => openStackPopup(group))
      stack.addTo(layer)
      continue
    }

    const m = group[0]!
    const marker = L.marker([m.lat, m.lon], {
      icon: buildIcon(m),
      keyboard: false,
      // Singletons (cams) sit above cluster bubbles when they overlap.
      zIndexOffset: m.count === 1 ? 1000 : 0
    })
    marker.on('click', () => {
      if (m.count === 1 && m.id) {
        emit('select', m.id)
        return
      }
      drillCluster(m)
    })
    marker.addTo(layer)
  }
}

// "You are here": a pulsing dot drawn above the camera layer. Re-created (not
// mutated) on change so the icon always matches the latest coordinate.
function renderUserMarker() {
  if (!map || !L) return
  if (userMarker) {
    userMarker.remove()
    userMarker = null
  }
  const loc = props.userLocation
  if (!loc) return
  userMarker = L.marker([loc.lat, loc.lng], {
    icon: L.divIcon({
      className: 'map-pin-wrap',
      html: `<div class="map-pin map-pin--me" aria-label="Your location">
        <span class="map-pin__me-pulse" aria-hidden="true"></span>
        <span class="map-pin__me-core" aria-hidden="true"></span>
      </div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    }),
    keyboard: false,
    interactive: false,
    zIndexOffset: 2000
  }).addTo(map)
}

onMounted(async () => {
  const container = await resolveContainer()
  if (!container) return
  L = (await import('leaflet')).default as unknown as typeof import('leaflet')
  await import('leaflet/dist/leaflet.css')

  map = L.map(container, {
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    worldCopyJump: false,
    zoomControl: false,
    attributionControl: true,
    // Stop infinite grey void past the poles / repeated worlds.
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 0.75
  })
  map.setView([props.initialView.lat, props.initialView.lng], props.initialView.zoom)

  L.tileLayer(TILE_URL, {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION,
    noWrap: true
  }).addTo(map)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  map.attributionControl.setPosition('bottomleft')

  layer = L.layerGroup().addTo(map)
  renderMarkers()
  renderUserMarker()

  map.whenReady(() => {
    map?.invalidateSize()
    emitView()
  })
  map.on('moveend', emitView)
})

watch(() => props.markers, renderMarkers)
watch(() => props.userLocation, renderUserMarker)
watch(() => props.camOpen, (open, wasOpen) => {
  if (wasOpen && !open && pendingStackGroup) openStackPopup(pendingStackGroup)
})

onBeforeUnmount(() => {
  map?.off('moveend', emitView)
  userMarker?.remove()
  userMarker = null
  map?.remove()
  map = null
  layer = null
})
</script>

<template>
  <div
    ref="el"
    class="map-canvas"
    :style="{ '--cam-pin-size': `${CAM_PIN_SIZE}px` }"
  />
</template>

<style scoped>
.map-canvas {
  width: 100%;
  height: 100%;
  background: var(--bg-1, #070a09);
}

.map-canvas :deep(.leaflet-container) {
  background: var(--bg-1, #070a09);
  font-family: var(--font-mono, ui-monospace, monospace);
  outline: none;
}

.map-canvas :deep(.map-pin) {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* --- Camera pin ---------------------------------------------------------- */
.map-canvas :deep(.map-pin--cam) {
  box-sizing: border-box;
  position: relative;
  width: var(--cam-pin-size, 52px);
  height: var(--cam-pin-size, 52px);
  border-radius: 8px;
  padding: 2px;
  overflow: visible;
  background: var(--glass-strong, rgba(7, 11, 10, 0.9));
  border: 1.5px solid var(--hairline-strong, rgba(255, 255, 255, 0.14));
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45), 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.map-canvas :deep(.map-pin--cam::after) {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -8px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid var(--glass-strong, rgba(7, 11, 10, 0.9));
}

.map-canvas :deep(.map-pin--cam:hover) {
  border-color: var(--phosphor);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.5),
    0 0 12px var(--phosphor-glow);
  z-index: 1000 !important;
}

.map-canvas :deep(.map-pin__thumb) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  display: block;
  background: #000;
}

.map-canvas :deep(.map-pin__dot) {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--phosphor);
  border: 2px solid var(--bg-0, #040605);
  box-shadow: 0 0 4px var(--phosphor-glow);
}

/* --- "You are here" marker ----------------------------------------------- */
.map-canvas :deep(.map-pin--me) {
  position: relative;
  width: 26px;
  height: 26px;
  pointer-events: none;
}

.map-canvas :deep(.map-pin__me-core) {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 35%, var(--phosphor-bright), var(--phosphor));
  border: 2px solid var(--bg-0, #040605);
}

.map-canvas :deep(.map-pin__me-pulse) {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 26px;
  height: 26px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--phosphor-soft);
  animation: map-me-pulse 2s ease-out infinite;
}

@keyframes map-me-pulse {
  0% {
    transform: translate(-50%, -50%) scale(0.4);
    opacity: 0.7;
  }
  100% {
    transform: translate(-50%, -50%) scale(2.6);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .map-canvas :deep(.map-pin__me-pulse) {
    animation: none;
    opacity: 0.35;
  }
}

/* --- Cluster marker ------------------------------------------------------ */
.map-canvas :deep(.map-pin--cluster) {
  position: relative;
  border-radius: 50%;
  background: rgba(7, 11, 10, 0.85);
  border: 2px solid var(--phosphor);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.map-canvas :deep(.map-pin--cluster:hover) {
  box-shadow:
    0 3px 10px rgba(0, 0, 0, 0.45),
    0 0 12px var(--phosphor-glow);
  z-index: 1000 !important;
}

.map-canvas :deep(.map-pin--cluster.map-pin--live) {
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.4),
    0 0 10px var(--phosphor-glow);
}

.map-canvas :deep(.map-pin__count) {
  color: var(--phosphor);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  line-height: 1;
}

/* --- Co-located stack marker --------------------------------------------- */
.map-canvas :deep(.map-pin--stack) {
  cursor: pointer;
}

.map-canvas :deep(.map-pin__stack-count) {
  position: absolute;
  bottom: -4px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  color: var(--phosphor-ink);
  background: var(--phosphor);
  border: 1.5px solid var(--bg-0, #040605);
  font-variant-numeric: tabular-nums;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

/* --- Stack picker popup -------------------------------------------------- */
.map-canvas :deep(.map-stack-popup .leaflet-popup-content-wrapper) {
  background: var(--glass-strong, rgba(7, 11, 10, 0.92));
  color: var(--text, #f4f6f5);
  border: 1px solid var(--hairline-strong, rgba(255, 255, 255, 0.16));
  border-radius: 12px;
  backdrop-filter: blur(10px);
}

.map-canvas :deep(.map-stack-popup .leaflet-popup-content) {
  margin: 12px;
  width: 336px !important;
}

.map-canvas :deep(.map-stack-popup .leaflet-popup-tip) {
  background: var(--glass-strong, rgba(7, 11, 10, 0.92));
  border: 1px solid var(--hairline-strong, rgba(255, 255, 255, 0.16));
}

.map-canvas :deep(.map-stack-popup a.leaflet-popup-close-button) {
  color: var(--text-dim, #8b9591);
}

.map-canvas :deep(.map-stack__title) {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim, #8b9591);
}

.map-canvas :deep(.map-stack__grid) {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--hairline-strong, rgba(255, 255, 255, 0.18)) transparent;
}

.map-canvas :deep(.map-stack__grid::-webkit-scrollbar) {
  width: 8px;
}

.map-canvas :deep(.map-stack__grid::-webkit-scrollbar-thumb) {
  background: var(--hairline-strong, rgba(255, 255, 255, 0.18));
  border-radius: 4px;
}

.map-canvas :deep(.map-stack__item) {
  padding: 0;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: #000;
  cursor: pointer;
  transition: border-color 120ms ease;
}

.map-canvas :deep(.map-stack__item:hover) {
  border-color: var(--phosphor);
}

.map-canvas :deep(.map-stack__item img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.map-canvas :deep(.map-stack__item:focus-visible) {
  border-color: var(--phosphor);
  outline: none;
}

/* --- Leaflet chrome ------------------------------------------------------ */
.map-canvas :deep(.leaflet-bar) {
  border: 1px solid var(--hairline-strong, rgba(255, 255, 255, 0.16));
}

.map-canvas :deep(.leaflet-bar a) {
  background: var(--glass-strong, rgba(7, 11, 10, 0.86));
  color: var(--text, #f4f6f5);
  border-bottom-color: var(--hairline, rgba(255, 255, 255, 0.08));
}

.map-canvas :deep(.leaflet-bar a:hover) {
  background: var(--bg-2, #0b0f0e);
  color: var(--phosphor);
}

.map-canvas :deep(.leaflet-control-attribution) {
  background: rgba(4, 6, 5, 0.7);
  color: var(--text-mute, #58615d);
  font-size: 10px;
}

.map-canvas :deep(.leaflet-control-attribution a) {
  color: var(--text-dim, #8b9591);
}
</style>
