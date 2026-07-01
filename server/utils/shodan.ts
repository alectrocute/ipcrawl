export interface CamScreenshot {
  data: string
  mime: string
}

export interface Cam {
  id: string
  ip: string
  port: number
  country?: string
  city?: string
  org?: string
  lat?: number
  lon?: number
  /**
   * Shodan's `_shodan.module` — the scan module that captured the banner
   * (e.g. `http`, `https`, `https-simple-new`, `rtsp`, `webcam`, `vnc`). We
   * keep it on the cam so the live-frame probe can skip cams that aren't
   * HTTP services (Workers can't speak RTSP or VNC).
   */
  module?: string
  /**
   * Camera vendor/brand, normalized from Shodan's `product` banner field (the
   * same signal our brand-specific search queries target). Canonicalized for
   * the brands we recognize, else the raw product with any `/version` suffix
   * trimmed. Surfaced + facet-filterable in /explore.
   */
  manufacturer?: string
  /**
   * When Shodan last scanned this endpoint, from the banner's top-level
   * `timestamp` field (ISO 8601). We sort each page by this descending so the
   * per-query `limit` keeps the newest cams within the page instead of
   * whatever order Shodan's relevance rank happened to surface.
   */
  shodanScannedAt?: string
  screenshot: CamScreenshot
}

interface ShodanScreenshot {
  data?: string
  mime?: string
  label?: string
}

interface ShodanBanner {
  ip_str?: string
  port?: number
  org?: string
  product?: string
  location?: {
    country_name?: string
    city?: string
    latitude?: number
    longitude?: number
  }
  _shodan?: { module?: string }
  opts?: { screenshot?: ShodanScreenshot }
  screenshot?: ShodanScreenshot
  timestamp?: string
}

// Canonical brand for the vendors common enough to be worth a clean facet
// value. Matched case-insensitively against Shodan's `product` string; first
// hit wins, so order only matters where one pattern could be a substring of a
// vendor we'd rather name specifically.
const MANUFACTURER_PATTERNS: [RegExp, string][] = [
  [/hikvision/i, 'Hikvision'],
  [/dahua/i, 'Dahua'],
  [/amcrest/i, 'Amcrest'],
  [/axis/i, 'Axis'],
  [/vivotek/i, 'Vivotek'],
  [/mobotix/i, 'Mobotix'],
  [/foscam/i, 'Foscam'],
  [/d-?link/i, 'D-Link'],
  [/tp-?link/i, 'TP-Link'],
  [/reolink/i, 'Reolink'],
  [/ubiquiti|unifi/i, 'Ubiquiti'],
  [/panasonic/i, 'Panasonic'],
  [/\bbosch\b/i, 'Bosch'],
  [/hanwha|wisenet|samsung techwin/i, 'Hanwha'],
  [/avtech/i, 'AVTECH'],
  [/geovision/i, 'GeoVision'],
  [/honeywell/i, 'Honeywell'],
  [/lorex/i, 'Lorex'],
  [/uniview/i, 'Uniview'],
  [/yoosee/i, 'Yoosee'],
  [/wyze/i, 'Wyze'],
  [/\bsony\b/i, 'Sony']
]

/**
 * Derive a camera manufacturer from Shodan's `product` banner. Recognized
 * brands collapse to a canonical name so the facet doesn't fragment on minor
 * spelling/casing variants; unrecognized products fall back to the raw string
 * with any trailing `/version` dropped (e.g. `Boa/0.94.14rc21` → `Boa`) so a
 * single vendor doesn't split into one bucket per firmware build.
 */
export function normalizeManufacturer(product: string | undefined): string | undefined {
  if (!product) return undefined
  const trimmed = product.trim()
  if (!trimmed) return undefined
  for (const [pattern, brand] of MANUFACTURER_PATTERNS) {
    if (pattern.test(trimmed)) return brand
  }
  return trimmed.split('/')[0]!.trim() || undefined
}

interface SearchPage {
  matches: ShodanBanner[]
  total: number
}

const SEARCH_ENDPOINT = 'https://api.shodan.io/shodan/host/search'
// Shodan returns 100 banners per page; this gives `limit` divided by 100,
// rounded up, query credits per query.
const RESULTS_PER_PAGE = 100
// Deep pagination occasionally trips Shodan's server-side search cursor
// ("Search cursor timed out. Restart the search query from page 1.") or a
// transient 5xx/429. These are retryable — re-requesting the same page
// usually mints a fresh cursor and succeeds.
const PAGE_RETRIES = 3
const PAGE_RETRY_BASE_MS = 750

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Streams webcams from Shodan via their REST API, yielding one cam at a time.
 *
 * This is a generator (not an array-returning function) on purpose: Cloudflare
 * Workers cap at 128MB, and each `has_screenshot:1` banner carries a base64
 * screenshot blob (tens-to-hundreds of KB, doubled in memory as a JS string).
 * Buffering an entire query — let alone several — blows the limit. By yielding
 * cams as we parse each page, the caller can persist + discard each screenshot,
 * so peak memory stays bounded to roughly one page of banners.
 *
 * Why REST instead of the `shodan` CLI? The CLI shells out to Python, which
 * we can't do on Workers. The REST API returns the same banner shape and runs
 * anywhere `fetch` is available — both Node and Workers.
 */
export async function* streamCamsForQuery(
  query: string,
  apiKey: string,
  limit = 200,
  camIdPepper = ''
): AsyncGenerator<Cam> {
  if (!apiKey) {
    throw new Error('Shodan API key is missing.')
  }

  // Track seen `ip:port` keys (cheap strings) for in-query dedup without
  // holding onto the heavy screenshot payloads.
  const seen = new Set<string>()
  const pages = Math.max(1, Math.ceil(limit / RESULTS_PER_PAGE))

  for (let page = 1; page <= pages; page++) {
    const url = new URL(SEARCH_ENDPOINT)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('query', query)
    url.searchParams.set('page', String(page))
    url.searchParams.set('minify', 'false')

    let data: SearchPage | null = null
    let lastError = ''
    for (let attempt = 1; attempt <= PAGE_RETRIES; attempt++) {
      let res: Response
      try {
        res = await fetch(url.toString(), {
          headers: { 'User-Agent': 'IPCrawl/1.0' }
        })
      } catch (err) {
        // Network-level failure (DNS, reset, abort) — as transient as a 5xx.
        const message = err instanceof Error ? err.message : String(err)
        lastError = `Shodan fetch failed on "${query}" (page ${page}): ${message}`
        if (attempt < PAGE_RETRIES) {
          console.warn(`[ipcrawl] ${lastError} — retrying (${attempt}/${PAGE_RETRIES})`)
          await sleep(PAGE_RETRY_BASE_MS * attempt)
        }
        continue
      }

      if (res.ok) {
        try {
          data = (await res.json()) as SearchPage
          break
        } catch (err) {
          // Shodan sometimes cuts these multi-MB screenshot pages off
          // mid-body: the status is 200 but the JSON is unterminated
          // ("Unterminated string in JSON at position …"). The body is gone,
          // but re-requesting the same page almost always delivers it whole —
          // treat exactly like a transient 5xx instead of failing the query.
          const message = err instanceof Error ? err.message : String(err)
          lastError = `Shodan truncated response on "${query}" (page ${page}): ${message}`
          if (attempt < PAGE_RETRIES) {
            console.warn(`[ipcrawl] ${lastError} — retrying (${attempt}/${PAGE_RETRIES})`)
            await sleep(PAGE_RETRY_BASE_MS * attempt)
          }
          continue
        }
      }

      const body = await res.text().catch(() => '')
      lastError = `Shodan ${res.status} on "${query}" (page ${page}): ${body.slice(0, 200)}`

      // 4xx other than 429 (rate limit) is a hard error — don't waste retries.
      const retryable = res.status >= 500 || res.status === 429
      if (!retryable) throw new Error(lastError)
      if (attempt < PAGE_RETRIES) {
        await sleep(PAGE_RETRY_BASE_MS * attempt)
      }
    }

    // Persistent transient failure on a deep page: stop and let the caller keep
    // whatever it already persisted rather than aborting the whole query. The
    // first page still throws so a fully-broken query surfaces upstream.
    if (!data) {
      if (page === 1) throw new Error(lastError)
      console.warn(`[ipcrawl] ${lastError} — stopping at page ${page}, keeping pages 1–${page - 1}`)
      return
    }

    const matches = data.matches || []
    // Drop the parsed page wrapper as soon as we have the matches array so the
    // GC can reclaim it while we await per-cam work below.
    data = null

    // Shodan's REST search endpoint has no server-side sort, so order within a
    // page is whatever relevance rank surfaced. Reorder newest-first by banner
    // `timestamp` so the per-query `limit` keeps the freshest cams on each
    // page (the cutoff lands on the oldest within the page). Banners missing a
    // timestamp sort to the end. ISO 8601 timestamps are lexicographically
    // sortable, so a string compare is enough — no Date.parse per row.
    matches.sort(
      (a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')
    )

    for (const banner of matches) {
      const ip = banner.ip_str
      const port = banner.port
      if (!ip || !port) continue

      const shot = banner.opts?.screenshot ?? banner.screenshot
      if (!shot?.data) continue

      const key = `${ip}:${port}`
      if (seen.has(key)) continue
      seen.add(key)

      const lat = banner.location?.latitude
      const lon = banner.location?.longitude

      yield {
        id: await shortHash(key, camIdPepper),
        ip,
        port,
        country: banner.location?.country_name,
        city: banner.location?.city,
        org: banner.org,
        lat: typeof lat === 'number' ? lat : undefined,
        lon: typeof lon === 'number' ? lon : undefined,
        module: banner._shodan?.module,
        manufacturer: normalizeManufacturer(banner.product),
        shodanScannedAt: banner.timestamp,
        screenshot: {
          data: shot.data,
          mime: shot.mime || 'image/jpeg'
        }
      }

      if (seen.size >= limit) return
    }

    // Shodan paginates lazily — a short page means we've hit the end.
    if (matches.length < RESULTS_PER_PAGE) return
  }
}

/**
 * Stable short id from `ip:port`. Prepends a pepper so the hash can't be
 * reversed by enumerating the IPv4×port space. Uses WebCrypto
 * (`crypto.subtle`), available in both modern Node and Cloudflare Workers.
 */
async function shortHash(input: string, pepper: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pepper}:${input}`))
  let hex = ''
  for (const byte of new Uint8Array(buf)) hex += byte.toString(16).padStart(2, '0')
  return hex.slice(0, 16)
}
