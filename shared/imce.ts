// Shared contract for the "Is My Camera Exposed?" (IMCE) feature. Imported from
// both the Nitro API route (server) and the imce layer's Vue page/composable
// via the `#shared/imce` alias, so the wire shape and the geo math the two ends
// agree on can never drift.

import type { MapBounds } from './map'
import { haversineKm, toRad } from './geo'
import { clampLat, clampLon } from './map'

export type { LatLon, LatLng, NullableLatLon } from './geo'

/** One exposed camera found near the visitor, sorted nearest-first. */
export interface ImceCamera {
  id: string
  lat: number
  lon: number
  live: boolean
  /** Highly-cached still thumbnail (never triggers a live probe). */
  thumb: string
  /** Great-circle distance from the visitor, in kilometres. */
  distanceKm: number
}

/** Result of scanning the catalogue around a visitor's coordinates. */
export interface ImceNearbyResponse {
  /** Cameras within `radiusKm` of the visitor (capped — see `truncated`). */
  count: number
  /** How many of those are currently answering a live probe. */
  liveCount: number
  /** Radius actually scanned, in kilometres. */
  radiusKm: number
  /** Distance to the closest camera, or null when none were found. */
  nearestKm: number | null
  /** A capped, nearest-first sample for rendering thumbnails in the alert. */
  cameras: ImceCamera[]
  /** True when the candidate cap was hit, so `count` is a floor, not exact. */
  truncated: boolean
}

/** Default neighbourhood/town radius scanned around the visitor. */
export const IMCE_DEFAULT_RADIUS_KM = 5
/** Hard cap so a hand-crafted URL can't ask us to scan the planet. */
export const IMCE_MAX_RADIUS_KM = 50
/** Cap on cameras returned in the sample (the map itself shows the rest). */
export const IMCE_MAX_CAMERAS = 24
/** Bound on candidate rows the radius query scans, to keep D1 work flat. */
export const IMCE_MAX_CANDIDATES = 5000
/** Zoom the scan map opens at once the visitor is located. */
export const IMCE_SCAN_ZOOM = 14

/** Lenient finite parse; junk yields `fallback`. */
function toNum(value: unknown, fallback: number): number {
  const n = typeof value === 'string'
    ? Number.parseFloat(value)
    : typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(n) ? n : fallback
}

export function clampRadiusKm(radius: unknown): number {
  const n = toNum(radius, IMCE_DEFAULT_RADIUS_KM)
  return Math.min(IMCE_MAX_RADIUS_KM, Math.max(0.1, n))
}

export { haversineKm }

/**
 * A bounding box that fully contains a circle of `radiusKm` around (lat, lon).
 * The server prefilters with this cheap, index-backed box (idx_cams_geo) and
 * then refines the survivors with the exact haversine distance. One degree of
 * latitude is ~111.32 km everywhere; longitude shrinks toward the poles, so we
 * widen the lon delta by 1/cos(lat) (floored so it never blows up at the pole).
 */
export function radiusBBox(lat: number, lon: number, radiusKm: number): MapBounds {
  const latDeg = radiusKm / 111.32
  const lonDeg = radiusKm / (111.32 * Math.max(Math.cos(toRad(lat)), 0.01))
  return {
    w: clampLon(lon - lonDeg),
    s: clampLat(lat - latDeg),
    e: clampLon(lon + lonDeg),
    n: clampLat(lat + latDeg)
  }
}
