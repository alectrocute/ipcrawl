// Shared route/path builders for client fetches and server-generated image URLs.
// Keeping these in one place prevents route drift between Nitro handlers and UI
// code while preserving the exact public paths.

export const API_CAM = '/api/cam'
export const API_IP = '/api/ip'
export const API_EXPLORE_CAMS = '/api/explore/cams'
export const API_EXPLORE_FACETS = '/api/explore/facets'
export const API_EXPLORE_FACET_SEARCH = '/api/explore/facets/search'
export const API_EXPLORE_THUMB = '/api/explore/thumb'
export const API_EXPLORE_FAVORITE = '/api/explore/favorite'
export const API_MAP_POINTS = '/api/map/points'
export const API_IMCE_NEARBY = '/api/imce/nearby'
export const API_REFRESH_STATUS = '/api/refresh/status'
export const API_STATS = '/api/stats'
export const API_STATS_HISTORY = '/api/stats/history'
export const FUN_CHANNEL_PREFIX = '/fun/c'

export const CAM_QUERY_LIVE = 'live'
export const CAM_QUERY_COORDS = 'coords'
export const CAM_QUERY_EXCLUDE = 'exclude'

export interface RandomCamPathOptions {
  live?: boolean
  coords?: boolean
  exclude?: string | null
}

export function apiLiveFramePath(id: string, ext = 'jpg'): string {
  return `/api/live/${id}.${ext}`
}

export function apiExploreCamPath(id: string): string {
  return `${API_EXPLORE_CAMS}/${id}`
}

export function apiExploreThumbPath(id: string, ext = 'jpg'): string {
  return `${API_EXPLORE_THUMB}/${id}.${ext}`
}

export function apiExploreFavoritePath(id: string): string {
  return `${API_EXPLORE_FAVORITE}/${id}`
}

export function apiRandomCamPath(opts: RandomCamPathOptions = {}): string {
  const params = new URLSearchParams()
  if (opts.live) params.set(CAM_QUERY_LIVE, '1')
  if (opts.coords) params.set(CAM_QUERY_COORDS, '1')
  if (opts.exclude) params.set(CAM_QUERY_EXCLUDE, opts.exclude)
  const query = params.toString()
  return query ? `${API_CAM}?${query}` : API_CAM
}

export function apiCamPath(id: string): string {
  return `${API_CAM}/${id}`
}

export function funChannelPath(id: string): string {
  return `${FUN_CHANNEL_PREFIX}/${id}`
}
