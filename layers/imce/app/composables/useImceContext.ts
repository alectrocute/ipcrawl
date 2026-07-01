/** True when the visitor is on the IMCE scan route or the configured marketing host. */
export function useImceContext() {
  const config = useRuntimeConfig()
  const route = useRoute()

  const onImceRoute = computed(() => route.path === '/imce' || route.path.startsWith('/imce/'))

  const onImceDomain = import.meta.server
    ? computed(() => {
        const domain = String(config.public.imceDomain || '').toLowerCase()
        if (!domain) return false
        const host = useRequestHeaders(['host']).host?.split(':')[0]?.toLowerCase()
        return host === domain
      })
    : computed(() => {
        const domain = String(config.public.imceDomain || '').toLowerCase()
        if (!domain || typeof window === 'undefined') return false
        return window.location.hostname.toLowerCase() === domain
      })

  const isImceContext = computed(() => onImceRoute.value || onImceDomain.value)

  return { onImceRoute, onImceDomain, isImceContext }
}
