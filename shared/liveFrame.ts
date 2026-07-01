// Client/server contract for image frame routes. The server writes these
// headers and source values; pollers use them to update badge state and cadence.

export const FRAME_SOURCE_HEADER = 'X-Frame-Source'
export const FRAME_ETAG_HEADER = 'ETag'
export const FRAME_IF_NONE_MATCH_HEADER = 'If-None-Match'
export const EDGE_CACHE_HEADER = 'X-Edge-Cache'
export const EDGE_KILL_SWITCH_HEADER = 'X-Edge-Kill-Switch'

export const FRAME_SOURCE_LIVE = 'live'
export const FRAME_SOURCE_SHODAN = 'shodan'
export const FRAME_SOURCE_THUMB = 'thumb'
export const FRAME_SOURCE_CACHE = 'cache'

export type FrameSource
  = | typeof FRAME_SOURCE_LIVE
    | typeof FRAME_SOURCE_SHODAN
    | typeof FRAME_SOURCE_THUMB
    | typeof FRAME_SOURCE_CACHE

// After this many consecutive Shodan stills (200 or 304), pollers stop — the
// frame cannot change until the daily refresh, so further polls only burn edge
// requests. Was 5; lowered after post-HN traffic showed most cams settle fast.
export const SHODAN_BACKOFF_AFTER = 2
export const EXPLORE_FRAME_POLL_MS = 3000
