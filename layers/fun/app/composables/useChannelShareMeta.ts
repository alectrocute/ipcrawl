import type { FunCamChannel } from '#shared/fun'
import { funChannelPath } from '#shared/routes'

/**
 * Share/SEO metadata for the fun channel page. Resolves a canonical share
 * origin (configured site URL → forwarded proxy headers → request URL),
 * derives the share URL/image from the current channel and registers the
 * `useSeoMeta` / canonical-link head entries — so the page itself stays
 * focused on channel orchestration.
 */
export function useChannelShareMeta(current: Ref<FunCamChannel | null>) {
  const route = useRoute()
  const runtimeConfig = useRuntimeConfig()
  const requestUrl = useRequestURL()
  const requestHeaders = useRequestHeaders(['host', 'x-forwarded-host', 'x-forwarded-proto', 'cf-visitor'])

  const shareTitle = computed(() => current.value
    ? `${current.value.location || 'Unknown Location'} · IP CRAWL Fun`
    : 'IP CRAWL Fun'
  )
  const shareDescription = computed(() => current.value
    ? `Watching ${current.value.location || 'an unknown channel'} on IP CRAWL Fun.`
    : 'Roulette mode for open webcams from around the world.'
  )

  function isLocalHostname(hostname: string) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1'
  }

  function normalizeOrigin(value?: string | null) {
    if (!value) return undefined

    try {
      const url = new URL(value.includes('://') ? value : `https://${value}`)
      if (import.meta.env.PROD && isLocalHostname(url.hostname)) return undefined
      return url.origin
    } catch {
      return undefined
    }
  }

  function forwardedProtocol() {
    const forwardedProto = requestHeaders['x-forwarded-proto']?.split(',')[0]?.trim()
    if (forwardedProto) return forwardedProto

    const cfVisitor = requestHeaders['cf-visitor']
    if (!cfVisitor) return undefined

    try {
      const parsed = JSON.parse(cfVisitor) as { scheme?: string }
      return parsed.scheme
    } catch {
      return undefined
    }
  }

  const shareOrigin = computed(() => {
    const configuredOrigin = normalizeOrigin(runtimeConfig.public.siteUrl)
    if (configuredOrigin) return configuredOrigin

    const forwardedHost = requestHeaders['x-forwarded-host']?.split(',')[0]?.trim()
    const protocol = forwardedProtocol() || requestUrl.protocol.replace(/:$/, '') || 'https'
    const candidates = [
      forwardedHost ? `${protocol}://${forwardedHost}` : undefined,
      requestHeaders.host ? `${protocol}://${requestHeaders.host}` : undefined,
      requestUrl.origin
    ]

    return candidates.map(candidate => normalizeOrigin(candidate)).find(Boolean)
  })
  const shareUrl = computed(() => shareOrigin.value
    ? new URL(current.value ? funChannelPath(current.value.id) : route.path, shareOrigin.value).toString()
    : current.value ? funChannelPath(current.value.id) : route.path
  )
  const shareImage = computed(() => current.value
    ? shareOrigin.value ? new URL(current.value.image, shareOrigin.value).toString() : current.value.image
    : undefined
  )
  const shareImageAlt = computed(() => current.value
    ? `IP CRAWL Fun camera feed${current.value.location ? ` from ${current.value.location}` : ''}`
    : 'IP CRAWL Fun'
  )

  useSeoMeta({
    title: () => shareTitle.value,
    description: () => shareDescription.value,
    ogTitle: () => shareTitle.value,
    ogDescription: () => shareDescription.value,
    ogType: 'website',
    ogUrl: () => shareUrl.value,
    ogImage: () => shareImage.value,
    ogImageAlt: () => shareImageAlt.value,
    twitterCard: 'summary_large_image',
    twitterTitle: () => shareTitle.value,
    twitterDescription: () => shareDescription.value,
    twitterImage: () => shareImage.value,
    twitterImageAlt: () => shareImageAlt.value
  })

  useHead({
    link: [
      {
        rel: 'canonical',
        href: () => shareUrl.value
      }
    ]
  })
}
