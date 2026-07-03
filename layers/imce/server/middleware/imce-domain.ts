/**
 * Custom-domain front door for the "Is My Camera Exposed?" campaign.
 *
 * When `NUXT_PUBLIC_IMCE_DOMAIN` is set (e.g. "ismycameraexposed.com"), that
 * host is reserved for the campaign's one public API route — `/api/ip`. Every
 * other path (the root, `/imce`, `/map`, other API routes, assets, deep links)
 * redirects to the IMCE scan page on the primary site (`${siteUrl}/imce`) so
 * the marketing domain can't be used to browse the catalogue, map, or fun
 * layers — it's the API surface, not a mirror of the app.
 *
 * The host check runs first and cheaply so non-IMCE hosts (the primary site,
 * local dev) pass through untouched. Empty `imceDomain` (the default) makes
 * the whole middleware a no-op.
 */
export default defineEventHandler((event) => {
  const domain = useRuntimeConfig(event).public.imceDomain
  if (!domain) return

  const host = getRequestHost(event, { xForwardedHost: true })
  if (!host) return

  // Strip any port and compare case-insensitively against the configured host.
  const bareHost = host.split(':')[0]?.toLowerCase()
  if (bareHost !== String(domain).toLowerCase()) return

  // `/api/ip` is the single route that lives on this host — let it through so
  // the handler (which itself 404s on other hosts) owns the response.
  const { pathname } = getRequestURL(event)
  if (pathname === '/api/ip') return

  // Everything else bounces to the IMCE scan page on the primary site. Fall
  // back to a relative `/imce` when `siteUrl` isn't configured (e.g. local
  // dev where the middleware is effectively a no-op anyway).
  const siteUrl = useRuntimeConfig(event).public.siteUrl
  const target = siteUrl ? `${String(siteUrl).replace(/\/$/, '')}/imce` : '/imce'
  return sendRedirect(event, target, 302)
})
