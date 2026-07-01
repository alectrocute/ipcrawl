import { readBooleanFlag } from '../utils/runtimeFlags'

/**
 * Emergency traffic brake. When `NUXT_OFFLINE_FOR_NOW` is true, HTML navigations
 * redirect to `/offline-for-now` and API routes return 503 so nothing hits D1,
 * live probes, or other expensive origin work. Build assets and the offline page
 * itself still pass through so the overload screen can render.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  if (!readBooleanFlag(config.offlineForNow, false)) return

  const { pathname } = getRequestURL(event)

  if (pathname === '/offline-for-now') return
  if (pathname.startsWith('/_nuxt/')) return
  if (pathname.includes('.')) return

  if (pathname.startsWith('/api/')) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Temporarily Unavailable',
      message: 'IP Crawl is temporarily offline. Please try again later.'
    })
  }

  return sendRedirect(event, '/offline-for-now', 503)
})
