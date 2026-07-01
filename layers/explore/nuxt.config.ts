// The IP CRAWL catalogue layer. Auto-registered by Nuxt's `layers/` scan, it
// owns the main `/` route, dashboard UI, and /api/explore Nitro handlers.
// Shared camera storage, D1 helpers, screenshots, and live-probe plumbing stay
// in root `server/` because the catalogue and Fun both reuse them.
export default defineNuxtConfig({})
