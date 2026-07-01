// Shared contract for the /fun roulette layer. Returned by the random/specific
// camera APIs and consumed by the Fun UI.
export interface FunCamChannel {
  id: string
  image: string
  liveProbeActive: boolean
  location: string | null
  org: string | null
  lat: number | null
  lon: number | null
  total: number
}
