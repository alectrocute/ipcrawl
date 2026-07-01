// Shared contract for the /map layer. Imported from both the Nitro API route
// (server) and the map layer's Vue components/page via the `#shared/map` alias,
// so the wire shape — and the LOD grid math that the client snaps to and the
// server buckets on — can never drift between the two ends.

import type { ExploreSource } from './explore'

export interface MapBounds {
  /** West longitude. */ w: number
  /** South latitude. */ s: number
  /** East longitude. */ e: number
  /** North latitude. */ n: number
}

/**
 * One rendered point on the map. The server collapses each LOD grid cell into a
 * single marker: a cell holding one camera is a *singleton* (carries the cam id
 * + thumbnail so it renders as a clickable still and opens the dialog); a cell
 * holding many is a *cluster* (just a count + centroid — click to drill in).
 */
export interface MapMarker {
  /** Cell centroid latitude (the exact point when `count === 1`). */
  lat: number
  lon: number
  /** Cameras represented by this marker. */
  count: number
  /** Cam id — present only for singletons (`count === 1`). */
  id: string | null
  /** Any camera in the cell currently answering a live probe. */
  live: boolean
  /** Still thumbnail for a singleton, else null. */
  thumb: string | null
  /**
   * Tight geographic extent of the cameras folded into this cell. Lets the
   * client drill a cluster by *fitting its actual spread* in one tap — which
   * splits it immediately — instead of stepping the zoom blindly and re-tapping
   * the same bubble many times. Collapses to the point itself for a singleton
   * (and for a co-located group, which then resolves to a stack picker).
   */
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export interface MapResponse {
  markers: MapMarker[]
  /** Sum of counts across the returned cells (cameras visible in the bbox). */
  total: number
  /** True when the cell cap was hit, so denser areas were prioritised. */
  truncated: boolean
  zoom: number
}

/** Normalised, validated query the points endpoint actually runs on. */
export interface MapQuery {
  zoom: number
  bounds: MapBounds
  source: ExploreSource
  countries: string[]
  cities: string[]
  orgs: string[]
  q: string
}

/**
 * Where the Leaflet canvas first frames the world. Lives in shared (not the map
 * composable) so any layer wanting to embed the canvas — the catalogue map, the
 * IMCE scan — can type its placement without a fragile cross-layer import.
 */
export interface MapInitialView {
  lat: number
  lng: number
  zoom: number
}

/** Emitted by the canvas after every settled pan/zoom. */
export interface MapViewChange {
  bounds: MapBounds
  center: { lat: number, lng: number }
  zoom: number
}

export const MAP_MIN_ZOOM = 2
export const MAP_MAX_ZOOM = 18
/**
 * Zoom at which the server stops doing grid-cell aggregation and returns raw
 * per-camera pins instead. This is what lets the client see exact (lat,lon)
 * collisions (typical of IP geolocation pinning many ranges to one point) and
 * surface the "N cameras here" stack pins + picker without forcing the user all
 * the way to MAP_MAX_ZOOM.
 */
export const MAP_STACK_ZOOM = 16
/** Target on-screen LOD cell size in CSS px; drives clusters-per-screen. */
export const MAP_CLUSTER_PX = 68
/** Hard cap on cells returned per request — bounds the payload and D1 work. */
export const MAP_MAX_CELLS = 900
/** Default view (centred world) used for SSR first paint. */
export const MAP_DEFAULT_VIEW = { lat: 39, lng: -98, zoom: 4 }
/** Leaflet can't render lat beyond the web-mercator clip; clamp to it. */
export const MAP_MAX_LAT = 85

/** Lenient finite-number parse for query params; junk yields `fallback`. */
export function toQueryNum(value: unknown, fallback: number): number {
  const n = typeof value === 'string'
    ? Number.parseFloat(value)
    : typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(n) ? n : fallback
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MAP_MIN_ZOOM
  return Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, Math.round(zoom)))
}

export function clampLat(lat: number): number {
  return Math.min(MAP_MAX_LAT, Math.max(-MAP_MAX_LAT, lat))
}

export function clampLon(lon: number): number {
  return Math.min(180, Math.max(-180, lon))
}

/**
 * Width (in degrees) of one LOD grid cell at a given zoom. The web-mercator
 * world is 256·2^zoom px wide, so a fixed-px cell maps to fewer degrees the
 * deeper you zoom — which is exactly the level-of-detail behaviour we want:
 * clusters subdivide as you zoom in until cells hold a single camera.
 */
export function mapCellDeg(zoom: number): number {
  const z = clampZoom(zoom)
  return Math.min(360, (MAP_CLUSTER_PX * 360) / (256 * 2 ** z))
}

const round5 = (v: number): number => Math.round(v * 1e5) / 1e5

/**
 * Expand viewport bounds outward to whole grid-cell boundaries for the given
 * zoom. Panning *within* a cell then yields a byte-identical request, so the
 * SWR cache (keyed by the snapped query string) collapses many small map nudges
 * into a single origin read — the core of keeping the D1 bill flat.
 */
export function snapBounds(bounds: MapBounds, zoom: number): MapBounds {
  const cell = mapCellDeg(zoom)
  const floor = (v: number) => Math.floor(v / cell) * cell
  const ceil = (v: number) => Math.ceil(v / cell) * cell
  return {
    w: round5(clampLon(floor(bounds.w))),
    s: round5(clampLat(floor(bounds.s))),
    e: round5(clampLon(ceil(bounds.e))),
    n: round5(clampLat(ceil(bounds.n)))
  }
}
