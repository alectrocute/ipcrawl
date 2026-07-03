import { streamCamsForQuery, type Cam } from '../../utils/shodan'
import { isBlocked } from '../../utils/blocklist'
import {
  type CamMeta,
  deleteCams,
  listArchivedCams,
  listCams,
  writeCamArchive,
  writeCamList,
  writeMeta,
  writeScreenshot
} from '../../utils/camStore'
import { upsertCams, pruneCams } from '../../utils/exploreStore'
import { readCamCounts, writeCamCountSnapshot } from '../../utils/statsSnapshot'
import { recordRunStart, recordRunFinish, recordRunHeartbeat } from '../../utils/refreshLog'

// Inline queries. Keeping the list in code is simpler and edits trigger a
// redeploy regardless.
//
// Strategy: brand-specific queries first for high-quality camera content with
// reliable live-probe paths, then a keyword sweep, then a broad catch-all with
// aggressive non-camera filtering. Each query costs 1–2 Shodan API credits
// (depending on pagination) and is paced at ~1 rps to avoid 429s.
const QUERIES: string[] = [
  // Hikvision — world's largest IP camera brand (~40% global market share).
  // Their ISAPI/Streaming snapshot endpoints are well-documented and have the
  // best live-probe hit rate of any single vendor in our path list.
  'has_screenshot:1 product:"Hikvision IP Camera" -screenshot.label:blank',

  // Dahua / Amcrest — second-largest camera manufacturer. Commonly paired with
  // /cgi-bin/snapshot.cgi which is also a top generic probe path.
  'has_screenshot:1 product:"Dahua" -screenshot.label:blank -screenshot.label:desktop',

  // Camera keyword sweep — catches the long tail of brands whose Shodan
  // product string we don't target by name. Matching "camera" in the HTTP
  // title finds most web-UI-accessible cameras regardless of vendor.
  'has_screenshot:1 http.title:"camera" -screenshot.label:blank -screenshot.label:desktop -screenshot.label:login -product:"Remote Desktop Protocol" -product:"VNC"',

  // Broad catch-all with tighter junk filtering than v1. Additionally
  // excludes login pages and text-only banners (the two most common
  // non-camera content types that leaked through the old single-query
  // approach) plus known dashboard/admin products that have screenshots
  // but aren't cameras.
  'has_screenshot:1 -screenshot.label:blank -screenshot.label:desktop -screenshot.label:login -screenshot.label:text -product:"Remote Desktop Protocol" -product:"VNC" -product:"Apache Tomcat" -product:"Grafana" -product:"Kibana" -product:"Webmin"'
]

const DAY_MS = 24 * 60 * 60 * 1000

function endpointKey(cam: Pick<CamMeta, 'ip' | 'port'>): string {
  return `${cam.ip}:${cam.port}`
}

function timestampMs(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toMeta(
  cam: Cam,
  id: string,
  previous: CamMeta | undefined,
  seenAt: string,
  screenshotHash: string
): CamMeta {
  return {
    id,
    ip: cam.ip,
    port: cam.port,
    country: cam.country,
    city: cam.city,
    org: cam.org,
    lat: cam.lat,
    lon: cam.lon,
    module: cam.module,
    manufacturer: cam.manufacturer,
    screenshotMime: cam.screenshot.mime,
    screenshotHash,
    firstSeenAt: previous?.firstSeenAt ?? previous?.lastSeenAt ?? seenAt,
    lastSeenAt: seenAt
  }
}

/**
 * Content fingerprint of a screenshot, hashed over the base64 payload as
 * Shodan delivers it (no decode needed just to compare). Stored in the cam's
 * DB row so the next refresh can tell "same still" from "new still" and skip
 * the write for the former — most stills survive several refresh cycles
 * unchanged.
 */
async function screenshotHashOf(base64: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function withTimestamps(cam: CamMeta, fallbackSeenAt: string): CamMeta {
  return {
    ...cam,
    firstSeenAt: cam.firstSeenAt ?? cam.lastSeenAt ?? fallbackSeenAt,
    lastSeenAt: cam.lastSeenAt ?? fallbackSeenAt
  }
}

/**
 * Upsert the fresh cam set into the DB and prune long-vanished rows. Existing
 * live probe columns are preserved by the upsert when this refresh has no new
 * probe data for a cam.
 */
async function syncExploreDb(metas: CamMeta[], now: number): Promise<void> {
  try {
    const written = await upsertCams(metas, new Map(), now)
    await pruneCams(now)
    console.log(`[ipcrawl] cam upsert: ${written} cams.`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ipcrawl] cam sync failed: ${message}`)
    throw err
  }
}

function buildArchive(
  fresh: CamMeta[],
  previous: CamMeta[],
  now: number,
  fallbackSeenAt: string,
  retentionMs: number
): CamMeta[] {
  const freshIds = new Set(fresh.map(cam => cam.id))
  const retained: CamMeta[] = []
  const seenIds = new Set<string>()

  for (const cam of [...fresh, ...previous]) {
    if (seenIds.has(cam.id) || isBlocked(cam)) continue

    const stamped = withTimestamps(cam, fallbackSeenAt)
    const lastSeenAt = timestampMs(stamped.lastSeenAt, now)
    if (!freshIds.has(stamped.id) && now - lastSeenAt > retentionMs) continue

    seenIds.add(stamped.id)
    retained.push(stamped)
  }

  return retained
}

export default defineTask({
  meta: {
    name: 'cams:refresh',
    description: 'Pull a fresh set of open webcams from Shodan and store them.'
  },
  async run() {
    const config = useRuntimeConfig()
    const shodanQueryPaceMs = config.timingMs?.shodanQueryPace ?? 1100
    const shareUrlRetentionMs = config.timingMs?.shareUrlRetention ?? DAY_MS
    const refreshedAt = new Date().toISOString()
    const refreshStartedAt = Date.parse(refreshedAt)

    // Leave a durable trace before any Shodan work, so even a run that
    // crashes is diagnosable from /api/status.
    console.log(`[ipcrawl] cams:refresh started at ${refreshedAt}`)
    await recordRunStart(refreshedAt)

    try {
      return await runRefresh(config, refreshedAt, refreshStartedAt, shodanQueryPaceMs, shareUrlRetentionMs)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ipcrawl] cams:refresh FAILED after ${Date.now() - refreshStartedAt}ms: ${message}`)
      await recordRunFinish(refreshedAt, { status: 'error', error: message })
      throw err
    }
  }
})

async function runRefresh(
  config: ReturnType<typeof useRuntimeConfig>,
  refreshedAt: string,
  refreshStartedAt: number,
  shodanQueryPaceMs: number,
  shareUrlRetentionMs: number
) {
  // Scrub the existing list against the current blocklist so newly-added
  // rules apply immediately, not at the next scheduled refresh.
  const existing = await listCams()
  const scrubbed = existing.filter(c => !isBlocked(c))
  const archivedExisting = await listArchivedCams()
  const archived = archivedExisting.filter(c => !isBlocked(c))
  if (scrubbed.length !== existing.length) {
    await deleteCams(existing.filter(c => isBlocked(c)).map(c => c.id))
    await writeCamList(scrubbed)
    console.log(`[ipcrawl] Scrubbed ${existing.length - scrubbed.length} blocked cams from DB.`)
  }
  const blockedArchivedIds = archivedExisting.filter(c => isBlocked(c)).map(c => c.id)
  if (blockedArchivedIds.length > 0) await deleteCams(blockedArchivedIds)

  const previousByEndpoint = new Map<string, CamMeta>()
  for (const cam of [...archived, ...scrubbed]) previousByEndpoint.set(endpointKey(cam), cam)

  if (QUERIES.length === 0) {
    console.warn('[ipcrawl] No queries configured. Skipping refresh.')
    await recordRunFinish(refreshedAt, { status: 'ok', count: 0, blocked: 0, written: 0, skipped: 0, queryErrors: [] })
    return { result: { count: 0, blocked: 0, errors: [] } }
  }

  console.log(`[ipcrawl] Refreshing cams across ${QUERIES.length} queries...`)

  // Stream-and-persist: we never hold more than a small batch of base64
  // screenshots in memory at once. We write each screenshot to storage as it
  // arrives and keep only the lightweight `CamMeta` (no binary) in the
  // in-memory list. 16-way bounded concurrency keeps writes flowing fast.
  const CONCURRENCY = 16
  const seen = new Set<string>()
  const metas: CamMeta[] = []
  const errors: { query: string, error: string }[] = []
  let blocked = 0
  let written = 0

  let skipped = 0

  // Liveness signal for the run log. Time-gated to one write per minute
  // regardless of how often it's called.
  const HEARTBEAT_EVERY_MS = 60_000
  let lastHeartbeat = Date.now()
  const heartbeat = async () => {
    if (Date.now() - lastHeartbeat < HEARTBEAT_EVERY_MS) return
    lastHeartbeat = Date.now()
    await recordRunHeartbeat(refreshedAt)
  }

  let batch: Cam[] = []
  const flush = async () => {
    await heartbeat()
    if (batch.length === 0) return
    const current = batch
    batch = []
    await Promise.all(current.map(async (cam) => {
      try {
        const previous = previousByEndpoint.get(endpointKey(cam))
        const id = previous?.id ?? cam.id
        const hash = await screenshotHashOf(cam.screenshot.data)
        // Same still as last refresh → skip the write.
        const unchanged = previous?.screenshotHash === hash
          && previous.screenshotMime === cam.screenshot.mime
        if (unchanged) {
          skipped++
        } else {
          await writeScreenshot(id, cam.screenshot.mime, cam.screenshot.data)
          written++
        }
        // Only list a cam once its screenshot is durably stored, so metadata
        // never points at a missing binary.
        metas.push(toMeta(cam, id, previous, refreshedAt, hash))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[ipcrawl] failed to write screenshot ${cam.id}: ${message}`)
      }
    }))
  }

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i]!
    // Shodan's REST API throttles to ~1 rps; pace queries to avoid 429s.
    if (i > 0) await new Promise(resolve => setTimeout(resolve, shodanQueryPaceMs))

    let kept = 0
    let queryBlocked = 0
    try {
      for await (const cam of streamCamsForQuery(
        query,
        config.shodanApiKey,
        config.shodanLimitPerQuery,
        config.camIdPepper
      )) {
        // Streaming a big query can run minutes between flushes (blocked /
        // duplicate cams never fill a batch), so beat here too. Time-gated,
        // so per-cam calls cost a Date.now() check, not a KV write.
        await heartbeat()

        const key = `${cam.ip}:${cam.port}`
        if (seen.has(key)) continue
        seen.add(key)

        if (isBlocked(cam)) {
          blocked++
          queryBlocked++
          continue
        }

        batch.push(cam)
        kept++
        if (batch.length >= CONCURRENCY) await flush()
      }
      console.log(`[ipcrawl]   "${query}" → ${kept} cams (${queryBlocked} blocked)`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ query, error: message })
      console.error(`[ipcrawl]   "${query}" failed:`, message)
    }
  }

  // Persist any cams left in the final partial batch.
  await flush()

  // Only overwrite camera rows if we actually got something back. Keeps the
  // site alive when Shodan rate-limits us or the API key is missing.
  if (metas.length > 0) {
    await syncExploreDb(metas, refreshStartedAt)
    await writeCamList(metas)
    await writeCamArchive(buildArchive(
      metas,
      [...scrubbed, ...archived],
      refreshStartedAt,
      refreshedAt,
      shareUrlRetentionMs
    ))
    await writeMeta({
      refreshedAt,
      count: metas.length,
      blocked,
      queries: QUERIES,
      errors
    })
    // Capture a durable point in the rolling "cameras over time" series. The
    // `cams` table hard-deletes rows after 60d (pruneCams), so without this
    // the 12-month chart on /stats couldn't be reconstructed from the live
    // DB. Best-effort: a failed write only costs us one historical point, it
    // must never fail the refresh itself.
    try {
      const counts = await readCamCounts()
      await writeCamCountSnapshot(refreshStartedAt, counts.count, counts.live)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ipcrawl] cam_count_snapshot write failed: ${message}`)
    }
    console.log(
      `[ipcrawl] Wrote ${written} screenshots (${skipped} unchanged, skipped) + metadata.`
    )
  }

  const summary = {
    count: metas.length,
    blocked,
    written,
    skipped,
    queryErrors: errors
  }
  await recordRunFinish(refreshedAt, { status: 'ok', ...summary })

  // Single structured line for easy searching in logs.
  console.log(`[ipcrawl] cams:refresh summary ${JSON.stringify({
    startedAt: refreshedAt,
    durationMs: Date.now() - refreshStartedAt,
    ...summary
  })}`)

  return { result: { count: metas.length, blocked, errors } }
}
