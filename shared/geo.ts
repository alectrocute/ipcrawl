// Small shared geographic primitives. Keep naming explicit: some browser APIs
// use `lng`, while catalogue/server records use `lon`.

export interface LatLon {
  lat: number
  lon: number
}

export interface LatLng {
  lat: number
  lng: number
}

export interface NullableLatLon {
  lat: number | null
  lon: number | null
}

const EARTH_RADIUS_KM = 6371

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance between two coordinates, in kilometres. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}
