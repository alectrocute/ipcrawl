import { isBlocked } from '../utils/blocklist'
import {
  deleteCams,
  listArchivedCams,
  listCams,
  writeCamArchive,
  writeCamList
} from '../utils/camStore'
import { readBooleanFlag } from '../utils/runtimeFlags'

/**
 * On cold start: scrub the D1 cam list against the current blocklist so
 * filter changes apply immediately (no need to wait for the next scheduled refresh).
 * If the database is empty, kick off the initial refresh detached so the server
 * keeps accepting requests while the first batch lands.
 *
 * Skipped on Cloudflare — Workers don't have a "boot" the way a long-lived
 * Node process does; refreshing there is exclusively the cron trigger's job.
 */
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  if (!readBooleanFlag(config.shodanRefreshOnBoot, true)) return

  const initDelayMs = config.timingMs?.camsInitDelay ?? 250

  setTimeout(async () => {
    try {
      const existing = await listCams()

      if (existing.length > 0) {
        const scrubbed = existing.filter(c => !isBlocked(c))
        if (scrubbed.length !== existing.length) {
          await deleteCams(existing.filter(c => isBlocked(c)).map(c => c.id))
          await writeCamList(scrubbed)
          console.log(
            `[ipcrawl] Scrubbed ${existing.length - scrubbed.length} blocked cams on boot.`
          )
        }
        const archivedExisting = await listArchivedCams()
        const scrubbedArchive = archivedExisting.filter(c => !isBlocked(c))
        if (scrubbedArchive.length !== archivedExisting.length) {
          await deleteCams(archivedExisting.filter(c => isBlocked(c)).map(c => c.id))
          await writeCamArchive(scrubbedArchive)
          console.log(
            `[ipcrawl] Scrubbed ${archivedExisting.length - scrubbedArchive.length} blocked archived cams on boot.`
          )
        }
        console.log(`[ipcrawl] Found ${scrubbed.length} cams in DB. Skipping boot refresh.`)
        return
      }

      console.log('[ipcrawl] Camera table empty; running initial refresh.')
      await runTask('cams:refresh')
    } catch (err) {
      console.error('[ipcrawl] Boot init failed:', err)
    }
  }, initDelayMs)
})
