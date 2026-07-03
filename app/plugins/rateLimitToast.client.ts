/**
 * Surfaces 429 responses as a toast so users know they've been rate-limited
 * and the site isn't broken. Wraps the global $fetch with an onResponseError
 * hook — every `useFetch` / `$fetch` call on the client routes through it.
 * SSR fetches are unaffected (this plugin is `.client.ts` only).
 *
 * Endpoints that 429 through JS fetch: stats, stats/history, explore/cams,
 * explore/cams/[id], explore/facets, explore/facets/search,
 * explore/favorite/[id], map/points, imce/nearby.
 *
 * Not covered (by design):
 *  - `/api/explore/thumb/[id]` is `<img>`-loaded; `<img @error>` can't see the
 *    status code, and the thumb rate budget (1000/10s) is high enough that real
 *    users never hit it. Cards already fall back to "NO SIGNAL".
 *  - `/api/live/[id]` never returns 429 — it degrades to the cached screenshot.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const toast = useToast()

  // A single filter change can fan into 2-3 concurrent 429s (cams + facets +
  // facet-search). One toast per window is enough — a cascade would be noisier
  // than the limit itself.
  const DEDUPE_MS = 5000
  let lastToastAt = 0

  // `$fetch` is ofetch's $Fetch instance. `.create()` returns a new $Fetch
  // with merged options (existing hooks preserved, ours appended).
  const wrapped = $fetch.create({
    onResponseError(ctx) {
      if (ctx.response?.status !== 429) return
      if (Date.now() - lastToastAt < DEDUPE_MS) return
      lastToastAt = Date.now()
      toast.add({
        title: 'Slow down',
        description: 'You\'re making requests too quickly. Please wait a moment and try again.',
        color: 'warning',
        icon: 'i-lucide-clock',
        duration: DEDUPE_MS
      })
    }
  })

  // Replace both references so `useFetch` (which may cache `nuxtApp.$fetch` at
  // boot) and bare `$fetch` calls both route through the wrapper. Nuxt doesn't
  // declare `$fetch` on `_NuxtApp` in its types, so we cast through `unknown`.
  ;(nuxtApp as unknown as { $fetch: typeof $fetch }).$fetch = wrapped
  globalThis.$fetch = wrapped
})
