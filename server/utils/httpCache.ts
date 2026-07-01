import type { H3Event } from 'h3'

// Shared conditional-request helpers for the image-serving routes
// (/api/live/[id], /api/explore/thumb/[id]).

export const CACHE_CONTROL = {
  noStore: 'no-store',
  liveFrame: 'public, max-age=3, s-maxage=3, stale-while-revalidate=10',
  shodanFrame: 'public, max-age=30, s-maxage=300, stale-while-revalidate=600',
  exploreThumb: 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
  funChannel: 'public, max-age=30, s-maxage=60, stale-while-revalidate=300'
} as const

export const HTTP_HEADER = {
  cacheControl: 'Cache-Control',
  contentLength: 'Content-Length',
  contentType: 'Content-Type',
  etag: 'ETag',
  ifNoneMatch: 'if-none-match'
} as const

// Strip weak-validator prefixes before comparing — intermediaries (including
// Cloudflare) may downgrade strong ETags to weak (`W/"..."`), and a byte-exact
// comparison would silently disable 304s for those clients.
function stripWeak(value: string): string {
  return value.startsWith('W/') ? value.slice(2) : value
}

export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false
  const target = stripWeak(etag)
  return ifNoneMatch
    .split(',')
    .map(v => stripWeak(v.trim()))
    .some(v => v === '*' || v === target)
}

export function setNotModified(
  event: H3Event,
  cacheControl: string,
  etag: string,
  extraHeaders: Record<string, string> = {}
): null {
  setResponseStatus(event, 304)
  setResponseHeader(event, HTTP_HEADER.cacheControl, cacheControl)
  setResponseHeader(event, HTTP_HEADER.etag, etag)
  for (const [name, value] of Object.entries(extraHeaders)) {
    setResponseHeader(event, name, value)
  }
  return null
}

/**
 * Cheap content fingerprint (sparse FNV-1a sample + length) so an ETag tracks
 * the underlying R2 object — which changes on the daily refresh or a live-frame
 * write-through — without hashing the whole frame on every request. A constant
 * per-cam ETag would pin conditional clients to a stale frame forever.
 */
export function contentEtag(prefix: string, id: string, bytes: Uint8Array): string {
  let h = 0x811c9dc5
  const step = Math.max(1, bytes.length >> 6)
  for (let i = 0; i < bytes.length; i += step) {
    h ^= bytes[i]!
    h = Math.imul(h, 0x01000193)
  }
  return `"${prefix}-${id}-${bytes.length.toString(36)}-${(h >>> 0).toString(36)}"`
}
