// The /fun layer owns the former roulette experience: random camera channel,
// CRT viewer, guess mode, screensaver, and /api/cam Nitro handlers. Shared
// camera storage/probing stays in root `server/` because IP CRAWL and Fun both
// read the same corpus.
export default defineNuxtConfig({})
