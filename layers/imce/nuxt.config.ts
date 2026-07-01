// The "Is My Camera Exposed?" (IMCE) layer. Auto-registered by Nuxt's `layers/`
// scan, it owns the `/imce` route, the geolocation scan UI, the
// `/api/imce/nearby` Nitro handler, and the custom-domain redirect middleware.
// Camera storage, D1 helpers, the thumbnail route, the Leaflet canvas and the
// single-cam dialog are deliberately reused from root `server/`, the explore
// layer and the map layer — IMCE is a new, marketable front door to the same
// catalogue, not a fork of it.
export default defineNuxtConfig({})
