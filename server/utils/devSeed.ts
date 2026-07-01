import {
  writeCamList,
  writeMeta,
  writeScreenshotBytes,
  type CamMeta
} from './camStore'
import { upsertCams, type LiveReconcile } from './exploreStore'
import { getExploreDb } from './exploreDb'
import { readCamCounts, writeCamCountSnapshot } from './statsSnapshot'

// --- Dev-only dummy data -----------------------------------------------------
//
// `npm run dev` runs against a LOCAL node:sqlite file (see exploreDb.ts) that
// starts empty — the real catalogue is only ever pulled from Shodan into prod
// D1 by the scheduled refresh, which we never want to run locally. So a dev
// server plugin calls `seedDevDatabase()` on boot to fill every table the UI
// reads from:
//
//   cams              — ~120 rows spread across real city coordinates so the
//                       catalogue paginates and the /map layer actually clusters
//   cam_favorites     — a sprinkling of votes so heart counts render and sort
//   cam_refresh_meta  — one "latest" row so /stats and the sync card have data
//
// Each cam also gets a lightweight SVG placeholder written to the (fs-backed in
// dev) screenshots store, so thumbnails resolve instead of 404ing. Live probes
// against these fake IPs will fail and fall back to that same still — exactly
// the production degradation path, just always exercised.

interface SeedCity {
  country: string
  city: string
  lat: number
  lon: number
}

// Real coordinates so the world map looks plausible and clusters where cities
// are dense. Multiple cams per city (jittered below) form the clusters; the
// long tail of one-offs renders as singleton thumbnails.
const CITIES: SeedCity[] = [
  { country: 'United States', city: 'New York', lat: 40.7128, lon: -74.006 },
  { country: 'United States', city: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
  { country: 'United States', city: 'Chicago', lat: 41.8781, lon: -87.6298 },
  { country: 'United States', city: 'Seattle', lat: 47.6062, lon: -122.3321 },
  { country: 'United States', city: 'Austin', lat: 30.2672, lon: -97.7431 },
  { country: 'Canada', city: 'Toronto', lat: 43.6532, lon: -79.3832 },
  { country: 'Canada', city: 'Vancouver', lat: 49.2827, lon: -123.1207 },
  { country: 'Mexico', city: 'Mexico City', lat: 19.4326, lon: -99.1332 },
  { country: 'Brazil', city: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  { country: 'Argentina', city: 'Buenos Aires', lat: -34.6037, lon: -58.3816 },
  { country: 'United Kingdom', city: 'London', lat: 51.5074, lon: -0.1278 },
  { country: 'France', city: 'Paris', lat: 48.8566, lon: 2.3522 },
  { country: 'Spain', city: 'Madrid', lat: 40.4168, lon: -3.7038 },
  { country: 'Germany', city: 'Berlin', lat: 52.52, lon: 13.405 },
  { country: 'Netherlands', city: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  { country: 'Italy', city: 'Rome', lat: 41.9028, lon: 12.4964 },
  { country: 'Sweden', city: 'Stockholm', lat: 59.3293, lon: 18.0686 },
  { country: 'Poland', city: 'Warsaw', lat: 52.2297, lon: 21.0122 },
  { country: 'Russia', city: 'Moscow', lat: 55.7558, lon: 37.6173 },
  { country: 'Turkey', city: 'Istanbul', lat: 41.0082, lon: 28.9784 },
  { country: 'United Arab Emirates', city: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { country: 'India', city: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { country: 'China', city: 'Shanghai', lat: 31.2304, lon: 121.4737 },
  { country: 'Japan', city: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { country: 'South Korea', city: 'Seoul', lat: 37.5665, lon: 126.978 },
  { country: 'Singapore', city: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { country: 'Australia', city: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { country: 'South Africa', city: 'Cape Town', lat: -33.9249, lon: 18.4241 },
  { country: 'Egypt', city: 'Cairo', lat: 30.0444, lon: 31.2357 },
  { country: 'Nigeria', city: 'Lagos', lat: 6.5244, lon: 3.3792 }
]

const ORGS = [
  'Comcast Cable', 'Deutsche Telekom', 'Orange S.A.', 'NTT Communications',
  'China Telecom', 'Vodafone', 'AT&T Services', 'Rostelecom', 'Telefonica',
  'KDDI Corporation', 'BT Group', 'Charter Communications'
]

// Mirrors the canonical brands normalizeManufacturer() emits, so the dev
// catalogue exercises the manufacturer facet/filter the same way prod does.
const MANUFACTURERS = [
  'Hikvision', 'Dahua', 'Axis', 'Vivotek', 'Mobotix', 'Foscam',
  'Reolink', 'Ubiquiti', 'Hanwha', 'Uniview', 'Amcrest', 'Sony'
]

// Only HTTP-family modules can answer a live frame probe; the rest exercise the
// "live unavailable, show the still" path on the dialog.
const MODULES = ['http', 'https', 'https-simple-new', 'rtsp', 'webcam', 'vnc']

const TOTAL_CAMS = 120
const DEV_MIME = 'image/svg+xml'

// Deterministic PRNG (mulberry32) so the dev dataset is identical across
// restarts — stable ids mean cached thumbnails and shareable ?cam= links keep
// working between dev sessions.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function id16(rand: () => number): string {
  let out = ''
  for (let i = 0; i < 16; i++) out += Math.floor(rand() * 16).toString(16)
  return out
}

function ipFrom(rand: () => number): string {
  const oct = () => 1 + Math.floor(rand() * 254)
  return `${oct()}.${oct()}.${oct()}.${oct()}`
}

// A small phosphor-on-black card: a camera glyph plus the location label and a
// LIVE/CACHED pill, themed to match the app so dummy thumbnails don't look
// broken. Served verbatim as image/svg+xml (the .jpg in the thumb URL is only a
// route suffix; content-type drives rendering).
function placeholderSvg(city: string, country: string, live: boolean): string {
  // Dev-seed data baked into a standalone SVG string, so it can't read the CSS
  // theme vars — keep this hex in sync with --phosphor-rgb in main.css if the
  // accent ever changes (this is the only literal copy outside the cascade,
  // alongside public/favicon.svg).
  const accent = live ? '#00d3e6' : '#5b6b64'
  const safe = (s: string) => s.replace(/[<>&]/g, c => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
  <rect width="320" height="240" fill="#0a0f0d"/>
  <rect x="0.5" y="0.5" width="319" height="239" fill="none" stroke="#1a2420"/>
  <g transform="translate(160 96)" fill="none" stroke="${accent}" stroke-width="3" stroke-linejoin="round">
    <rect x="-34" y="-20" width="56" height="40" rx="4"/>
    <path d="M22 -8 L44 -20 L44 20 L22 8 Z"/>
    <circle cx="-6" cy="0" r="9"/>
  </g>
  <text x="160" y="160" fill="#f4f6f5" font-family="monospace" font-size="16" font-weight="700" text-anchor="middle">${safe(city)}</text>
  <text x="160" y="182" fill="#8b9591" font-family="monospace" font-size="12" text-anchor="middle">${safe(country)}</text>
  <g transform="translate(160 206)">
    <rect x="-30" y="-11" width="60" height="20" rx="10" fill="none" stroke="${accent}"/>
    <text x="0" y="3" fill="${accent}" font-family="monospace" font-size="10" font-weight="700" letter-spacing="1.5" text-anchor="middle">${live ? 'LIVE' : 'CACHED'}</text>
  </g>
</svg>`
}

/**
 * Fill the local dev database + screenshot store with dummy data, but only if
 * the cams table is empty (so restarts don't duplicate or clobber edits). No-op
 * and returns 0 when already populated. Returns the number of cams inserted.
 *
 * Caller is responsible for gating this to dev (`import.meta.dev`) — running it
 * against a real D1 binding would pollute production.
 */
export async function seedDevDatabase(): Promise<number> {
  const db = await getExploreDb()

  const existing = await db.prepare('SELECT COUNT(*) AS n FROM cams').first<{ n: number }>()
  if ((existing?.n ?? 0) > 0) return 0

  const rand = mulberry32(0x1c2a3b4d)
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000

  const metas: CamMeta[] = []
  const live = new Map<string, LiveReconcile>()
  const stills: { id: string, svg: string }[] = []

  for (let i = 0; i < TOTAL_CAMS; i++) {
    const place = CITIES[i % CITIES.length]!
    const id = id16(rand)
    // Jitter around the city centre so same-city cams land in adjacent map
    // cells (some cluster, some resolve to singletons as you zoom).
    const lat = place.lat + (rand() - 0.5) * 0.9
    const lon = place.lon + (rand() - 0.5) * 0.9
    const isLive = rand() < 0.35
    const seenAgoMs = Math.floor(rand() * 12 * DAY)
    const lastSeenAt = new Date(now - seenAgoMs).toISOString()
    const firstSeenAt = new Date(now - seenAgoMs - Math.floor(rand() * 60 * DAY)).toISOString()

    metas.push({
      id,
      ip: ipFrom(rand),
      port: [80, 81, 443, 554, 8080, 8000][Math.floor(rand() * 6)]!,
      country: place.country,
      city: place.city,
      org: ORGS[Math.floor(rand() * ORGS.length)]!,
      module: MODULES[Math.floor(rand() * MODULES.length)]!,
      manufacturer: MANUFACTURERS[Math.floor(rand() * MANUFACTURERS.length)]!,
      lat,
      lon,
      screenshotMime: DEV_MIME,
      screenshotHash: id,
      firstSeenAt,
      lastSeenAt
    })

    // upsertCams only marks a cam live when it has a fresh probe in this map.
    if (isLive) live.set(id, { path: '/dev/live', at: now })
    stills.push({ id, svg: placeholderSvg(place.city, place.country, isLive) })
  }

  // 1) Cam rows (D1).
  await upsertCams(metas, live, now)

  // 2) Placeholder stills (fs-backed screenshots store in dev).
  const encoder = new TextEncoder()
  for (const { id, svg } of stills) {
    await writeScreenshotBytes(id, DEV_MIME, encoder.encode(svg))
  }

  // 3) Favorite votes — give the first chunk of cams varied tallies so the
  //    "most loved" sort and the heart counts have something to show.
  const favStatements = []
  for (let i = 0; i < 40; i++) {
    const votes = Math.floor(rand() * 9)
    for (let v = 0; v < votes; v++) {
      favStatements.push(
        db.prepare(
          'INSERT OR IGNORE INTO cam_favorites (cam_id, voter_hash, created_at) VALUES (?,?,?)'
        ).bind(metas[i]!.id, `dev-voter-${i}-${v}`, now - Math.floor(rand() * 5 * DAY))
      )
    }
  }
  if (favStatements.length > 0) {
    await db.batch(favStatements)
    // Sync the denormalized tally to the seeded votes. Prod keeps cams.fav_count
    // current through setFavorite, but the seed writes cam_favorites directly,
    // so without this the grid's heart counts and "most loved" sort read 0.
    await db
      .prepare('UPDATE cams SET fav_count = (SELECT COUNT(*) FROM cam_favorites WHERE cam_id = cams.id)')
      .run()
  }

  // 4) Refresh meta so /stats and the sync countdown card have a "latest" run.
  await writeMeta({
    refreshedAt: new Date(now).toISOString(),
    count: metas.length,
    blocked: 0,
    queries: ['dev:seed'],
    errors: []
  })

  // 5) Prime the in-memory list cache so the first request doesn't re-read D1.
  await writeCamList(metas)

  return metas.length
}

/**
 * Seed the rolling 12-month history for the /stats "cameras over time" chart
 * when the snapshots table is empty. The `cams` table hard-deletes rows after
 * 60d, so without these snapshots the chart would stay empty until the refresh
 * fills it in over a year. Independent of `seedDevDatabase`'s cams guard so a
 * dev who already had a local DB from before this feature landed still gets a
 * populated chart on their next boot.
 *
 * One point per sync cadence — the production refresh runs daily, so we
 * seed 1 point/day for 365 days (~365 points), matching what the chart will
 * actually look like in production.
 *
 * Caller is responsible for gating this to dev (`import.meta.dev`).
 */
export async function seedDevCamCountSnapshots(): Promise<void> {
  const db = await getExploreDb()

  const existing = await db.prepare('SELECT COUNT(*) AS n FROM cam_count_snapshots').first<{ n: number }>()
  if ((existing?.n ?? 0) > 0) return

  // Anchor the history to the current catalogue size so the curve lands at the
  // real "today" value. If cams is empty (seedDevDatabase bailed), still seed
  // a small rising series so the chart isn't blank.
  const counts = await readCamCounts()
  const today = Math.max(counts.count, 10)
  const floor = Math.max(1, Math.round(today * 0.4))

  const now = Date.now()
  const SYNC_EVERY_MS = 24 * 60 * 60 * 1000 // mirrors the production cron
  const WINDOW_MS = 365 * 24 * 60 * 60 * 1000
  const total = Math.floor(WINDOW_MS / SYNC_EVERY_MS) // ~365
  for (let i = total; i >= 0; i--) {
    const ts = now - i * SYNC_EVERY_MS
    const ramp = (total - i) / total // 0 → 1 across the window
    // Light noise so adjacent points aren't visually flat — real Shodan pulls
    // bounce a few cams either way between syncs.
    const wobble = Math.round((Math.sin(i * 1.3) + Math.cos(i * 0.7)) * (today * 0.01))
    const count = Math.max(1, Math.round(floor + (today - floor) * ramp) + wobble)
    const live = Math.round(count * 0.3)
    await writeCamCountSnapshot(ts, count, live)
  }
}
