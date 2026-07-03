// Shared API contracts for the public /api/ip endpoint. Server handler returns
// this shape and the /api documentation page consumes it for the live "try it"
// panel.

/**
 * Response shape for `GET /api/ip`.
 *
 * `found` is true when the requesting IP matches at least one row in the
 * catalogue. The IP itself is echoed back so a caller can confirm which
 * address was resolved from their forwarded headers (cf-connecting-ip, then
 * x-forwarded-for).
 *
 * `checkedAt` is the server's epoch-ms clock at the moment the lookup ran.
 * Paired with the browser's 5-minute `Cache-Control: private, max-age=300`,
 * a caller can compare `Date.now() - checkedAt` to detect a cached answer:
 * near-zero = fresh from origin, up to ~300000 = served from the browser
 * cache, beyond that = the cache expired and a new origin hit just ran.
 */
export interface CheckMyIpResponse {
  found: boolean
  ip: string
  checkedAt: number
}
