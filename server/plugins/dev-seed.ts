import { seedDevCamCountSnapshots, seedDevDatabase } from '../utils/devSeed'

/**
 * Dev-only: seed the local node:sqlite database with dummy data on boot so the
 * catalogue, map and stats all render under `npm run dev`. Seeding is
 * idempotent — it no-ops once the cams table is populated — so it's safe to
 * run on every boot. Failures are logged, never thrown: a broken seed must not
 * stop the dev server from coming up.
 */
export default defineNitroPlugin(() => {
  if (!import.meta.dev) return

  // Seed cams first so the snapshot history can anchor its "today" value to
  // the real catalogue size; the snapshot seed is independently idempotent on
  // its own table, so a dev who already had cams from before this feature
  // landed still gets a populated /stats trend chart on the next boot.
  seedDevDatabase()
    .then((count) => {
      if (count > 0) console.log(`[ipcrawl] dev seed: inserted ${count} dummy cams (local sqlite).`)
      else console.log('[ipcrawl] dev seed: local database already populated, skipping.')
      return seedDevCamCountSnapshots()
    })
    .then(() => {})
    .catch((err) => {
      console.error('[ipcrawl] dev seed failed:', err)
    })
})
