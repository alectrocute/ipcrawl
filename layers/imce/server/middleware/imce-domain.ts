/**
 * Custom-domain front door for the "Is My Camera Exposed?" campaign.
 *
 * When `NUXT_PUBLIC_IMCE_DOMAIN` is set (e.g. "ismycameraexposed.com") and a
 * request arrives on that host's root, redirect it to `/imce` so the marketing
 * domain lands straight on the scan. Everything else — the primary site, the
 * API, assets, and `/imce` itself — passes through untouched, so this is a
 * cheap host check on the hot path, not a rewrite layer.
 *
 * To activate: point the domain at this server and set the env var. Empty (the
 * default) makes this middleware a no-op.
 */
export default defineEventHandler((event) => {
  const domain = useRuntimeConfig(event).public.imceDomain
  if (!domain) return

  const host = getRequestHost(event, { xForwardedHost: true })
  if (!host) return

  // Strip any port and compare case-insensitively against the configured host.
  const bareHost = host.split(':')[0]?.toLowerCase()
  if (bareHost !== String(domain).toLowerCase()) return

  // Only the root redirects; deep links (and /imce) stay where they are so the
  // redirect can't loop or trap API/asset requests.
  const { pathname } = getRequestURL(event)
  if (pathname === '/' || pathname === '') {
    return sendRedirect(event, '/imce', 302)
  }
})
