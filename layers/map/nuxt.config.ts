// The IP CRAWL map layer. Auto-registered by Nuxt's `layers/` scan, it owns the
// `/map` route, the Leaflet-based atlas UI, and the `/api/map/points` LOD Nitro
// handler. Camera storage, D1 helpers, screenshots, the thumbnail route and the
// single-cam dialog are deliberately *not* duplicated here — they're reused from
// root `server/` and the explore layer so the map is a pure new view over the
// same catalogue.
export default defineNuxtConfig({})
