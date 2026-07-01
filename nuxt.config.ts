// https://nuxt.com/docs/api/configuration/nuxt-config
declare const process: { env: Record<string, string | undefined> }

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: false
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL
        || process.env.CF_PAGES_URL
        || process.env.VERCEL_PROJECT_PRODUCTION_URL
        || process.env.VERCEL_URL
        || process.env.URL
        || '',
      // Optional manual override for the explorer's hero/featured stream. When
      // set, this cam is fetched on its own (even if it's not on page 1) and
      // pinned as the large featured card for every viewer. Empty → no hero.
      // MUST live under `public` so the client payload + `NUXT_PUBLIC_` env
      // override both resolve it.
      featuredCamId: process.env.NUXT_PUBLIC_FEATURED_CAM_ID || '',
      // Marketing front door for the "Is My Camera Exposed?" campaign: a bare
      // host (e.g. "ismycameraexposed.com") that should land on /imce. When set,
      // server middleware redirects that host's root to the scan page. Empty
      // (default) disables the redirect, so the main site is unaffected. Point
      // the domain at this Worker (wrangler `routes`/custom domain) to use it.
      imceDomain: process.env.NUXT_PUBLIC_IMCE_DOMAIN || ''
    },
    shodanApiKey: process.env.NUXT_SHODAN_API_KEY || '',
    voterPepper: process.env.NUXT_VOTER_PEPPER || '',
    camIdPepper: process.env.NUXT_CAM_ID_PEPPER || '',
    shodanRefreshOnBoot: process.env.NUXT_SHODAN_REFRESH_ON_BOOT === 'true',
    shodanLimitPerQuery: parseInt(process.env.NUXT_SHODAN_LIMIT_PER_QUERY || '1500'),
    // Emergency brake for edge-cost spikes. When true, expensive live work is
    // skipped and /api/live serves only cached screenshots.
    edgeKillSwitch: process.env.NUXT_EDGE_KILL_SWITCH === 'true',
    // When true, HTML navigations redirect to /offline-for-now and API routes
    // return 503 so no expensive origin work runs while overloaded.
    offlineForNow: process.env.NUXT_OFFLINE_FOR_NOW === 'true',
    // Keep live probing configurable; the endpoint also has a per-IP limiter
    // and Cache API shield so viewer traffic fans into one origin read per
    // cam/bucket.
    enableLiveProbe: process.env.NUXT_ENABLE_LIVE_PROBE === 'true',
    // R2 write-through of fresh live frames is useful for keeping fallbacks
    // current. The implementation gates writes through KV so it remains
    // bounded across Workers isolates.
    enableLiveFramePersist: process.env.NUXT_ENABLE_LIVE_FRAME_PERSIST === 'true',
    timingMs: {
      // Delay before boot-time initialization kicks off in long-lived Node.
      camsInitDelay: 250,
      // Delay between Shodan query pages to avoid API throttling.
      shodanQueryPace: 1100,
      // Direct /fun/c/:id links stay resolvable after a cam disappears from a
      // refresh, without keeping it in the random rotation.
      shareUrlRetention: 24 * 60 * 60 * 1000,
      // Live probe and frame-fetch behavior. The probe runs in `waitUntil`
      // (never blocks the response), so its budget is sized to cover the full
      // path list in the background rather than to bound request latency.
      liveProbeTimeout: 1500,
      liveProbeBudget: 15000,
      liveFetchTimeout: 3000,
      liveFrameCache: 1000,
      liveFrameGrace: 8000,
      liveProbeRetry: 10 * 60 * 1000,
      liveFramePersistLocal: 15 * 1000,
      liveFramePersistGlobal: 60 * 1000
    }
  },

  routeRules: {
    // Overload page must never be cached while the brake is toggled on/off.
    '/offline-for-now': { headers: { 'cache-control': 'no-store' } },

    // Fun's index is a thin server-side redirect to a random /fun/c/<id> —
    // keep it uncached so every fresh visit rolls a new channel.
    '/fun': { headers: { 'cache-control': 'no-store' } },

    // Channel pages are pure functions of `id` (same id → same HTML), so a
    // generous SWR window means a single SSR fans out to every viewer of
    // that channel during the window.
    '/fun/c/**': { swr: 300 },

    // Hashed Nuxt build assets are immutable for the life of a deploy.
    '/_nuxt/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' }
    },

    // Diagnostic endpoint — barely changes between refreshes.
    '/api/status': { swr: 60 },

    // Live refresh-task state for the sync cards. Short SWR so all polling
    // clients collapse into one KV/D1 read every few seconds while still
    // flipping to "syncing" promptly when a run starts.
    '/api/refresh/status': { swr: 10 },

    // Aggregate stats for /stats only move on the daily Shodan refresh, so a
    // long SWR window collapses all viewers into ~2 origin reads per hour.
    '/api/stats': { swr: 1800 },

    // 12-month rolling catalogue-size series for the /stats trend chart. Same
    // cadence as the aggregate above (a new snapshot lands every 24h with the
    // refresh), so the same long SWR is safe.
    '/api/stats/history': { swr: 1800 },

    // --- IP CRAWL catalogue ------------------------------------------------
    // NOTE: the root catalogue page is intentionally NOT route-rule cached. Nitro
    // route-rule caching (swr/isr/cache) strips the useFetch/useAsyncData
    // payload from the cached HTML, so a deep-linked filter URL would render
    // correct cards server-side but hydrate the client to the empty `default`
    // (and then flash/strand on the empty state). The expensive work — the D1
    // scans behind the list + facets — is already shielded by the per-query
    // SWR on the API routes below, so the fan-out benefit is preserved without
    // breaking client hydration.
    //
    // Paginated list + facets: short SWR per unique filter/page combination so
    // the D1 scans collapse into one origin read each.
    '/api/explore/cams': { swr: 30 },
    // Facet COUNT(*)/GROUP BY scans are the priciest explore reads, and the
    // sidebar tallies only move on the daily refresh — so cache them far longer
    // than the grid. 10 min collapses ~10× more of the per-combo scans into a
    // single origin read at zero perceptible staleness cost.
    '/api/explore/facets': { swr: 600 },
    // Map LOD markers: short SWR per snapped-bbox+zoom+filter combo. The client
    // snaps the viewport to grid-cell boundaries, so in-cell panning hits the
    // same key and collapses into one D1 read.
    '/api/map/points': { swr: 30 },
    // Per-id detail is a pure function of the id between refreshes.
    // NOTE: the favorite-vote POST deliberately lives OUTSIDE this prefix (at
    // /api/explore/favorite/[id]) — when it sat under cams/**, the SWR cache
    // wrapper swallowed the request body and replayed one voter's response to
    // everyone for 2 minutes.
    '/api/explore/cams/**': { swr: 120 }

    // /api/explore/thumb/** sets its own long-cache headers + ETag in code
    // (highly cached still, no live probe), like /api/live/** and /api/cam/[id].
    // /api/cam (random) intentionally stays uncached.
  },

  experimental: {
    // Wrap route changes in document.startViewTransition so shared elements
    // (brand, header, page shell — see main.css) morph between pages. The
    // Nuxt plugin only fires when the page component actually changes, so
    // the explorer's query-string commits (filters, ?cam= dialog) never pay
    // the snapshot cost. Skipped automatically under prefers-reduced-motion
    // and in browsers without the API.
    viewTransition: true
  },

  compatibilityDate: '2025-01-15',

  nitro: {
    // Target Cloudflare Workers (module syntax). Switch back to 'node-server'
    // by setting NITRO_PRESET=node-server if you want a plain Node build.
    preset: process.env.NITRO_PRESET || 'cloudflare_module',

    experimental: {
      tasks: true
    },

    scheduledTasks: {
      // The cloudflare_module preset translates this into Worker cron
      // triggers automatically (mirrored in wrangler.jsonc).
      '0 0 * * *': ['cams:refresh']
    },

    // Production storage — bound to Cloudflare KV for livepersist gates and R2
    // for screenshot bytes (~50KB each). Bindings are declared in wrangler.
    storage: {
      cams: {
        driver: 'cloudflareKVBinding',
        binding: 'CAMS_KV'
      },
      screenshots: {
        driver: 'cloudflareR2Binding',
        binding: 'SCREENSHOTS_R2'
      }
    },

    // Dev-only fallback — fs-backed storage so `npm run dev` works without
    // Cloudflare bindings or a remote KV/R2 round trip.
    devStorage: {
      cams: {
        driver: 'fs',
        base: './.data/cams'
      },
      screenshots: {
        driver: 'fs',
        base: './.data/screenshots'
      }
    }
  },

  vite: {
    optimizeDeps: {
      include: [
        'marked',
        'leaflet'
      ]
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
