// https://nuxt.com/docs/api/configuration/nuxt-config
declare const process: { env: Record<string, string | undefined> }

const dataDir = './data'

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
        || process.env.URL
        || '',
      featuredCamId: process.env.NUXT_PUBLIC_FEATURED_CAM_ID || '',
      imceDomain: process.env.NUXT_PUBLIC_IMCE_DOMAIN || ''
    },
    shodanApiKey: process.env.NUXT_SHODAN_API_KEY || '',
    voterPepper: process.env.NUXT_VOTER_PEPPER || '',
    camIdPepper: process.env.NUXT_CAM_ID_PEPPER || '',
    shodanRefreshOnBoot: process.env.NUXT_SHODAN_REFRESH_ON_BOOT === 'true',
    shodanLimitPerQuery: parseInt(process.env.NUXT_SHODAN_LIMIT_PER_QUERY || '1500'),
    edgeKillSwitch: process.env.NUXT_EDGE_KILL_SWITCH === 'true',
    offlineForNow: process.env.NUXT_OFFLINE_FOR_NOW === 'true',
    enableLiveProbe: process.env.NUXT_ENABLE_LIVE_PROBE === 'true',
    enableLiveFramePersist: process.env.NUXT_ENABLE_LIVE_FRAME_PERSIST === 'true',
    timingMs: {
      camsInitDelay: 250,
      shodanQueryPace: 1100,
      shareUrlRetention: 24 * 60 * 60 * 1000,
      liveProbeTimeout: 2500,
      liveProbeBudget: 30000,
      liveFetchTimeout: 5000,
      liveFrameCache: 800,
      liveFrameGrace: 10000,
      liveProbeRetry: 5 * 60 * 1000,
      liveFramePersistLocal: 10 * 1000,
      liveFramePersistGlobal: 45 * 1000
    }
  },

  routeRules: {
    '/offline-for-now': { headers: { 'cache-control': 'no-store' } },
    '/fun': { headers: { 'cache-control': 'no-store' } },
    '/fun/c/**': { swr: 300 },
    '/_nuxt/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' }
    },
    '/api/status': { swr: 60 },
    '/api/refresh/status': { swr: 10 },
    '/api/stats': { swr: 1800 },
    '/api/stats/history': { swr: 1800 },
    '/api/explore/cams': { swr: 30 },
    '/api/explore/facets': { swr: 600 },
    '/api/explore/facets/search': { swr: 1800 },
    '/api/map/points': { swr: 30 },
    '/api/explore/cams/**': { swr: 120 },
    // Public exposure check. CORS-open (called from third-party pages like
    // ismycameraexposed.com) and browser-cached per IP for 5 minutes — see
    // server/api/ip.get.ts for why this isn't a SWR/route-rule cache.
    '/api/ip': { cors: true }
  },

  experimental: {
    viewTransition: true
  },

  compatibilityDate: '2025-01-15',

  nitro: {
    preset: 'node-server',

    experimental: {
      tasks: true
    },

    scheduledTasks: {
      '0 0 * * *': ['cams:refresh']
    },

    storage: {
      cams: {
        driver: 'fs',
        base: `${dataDir}/cams`
      },
      screenshots: {
        driver: 'fs',
        base: `${dataDir}/screenshots`
      },
      cache: {
        driver: 'fs',
        base: `${dataDir}/cache`
      }
    },

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
