<script setup lang="ts">
import type { StatsHistoryResponse, StatsResponse } from '#shared/stats'
import { API_STATS, API_STATS_HISTORY } from '#shared/routes'

defineOptions({ name: 'StatsPage' })

const { data, error } = await useFetch<StatsResponse>(API_STATS)
const { data: history } = await useFetch<StatsHistoryResponse>(API_STATS_HISTORY)

const title = 'Stats — IP Crawl'
const description = 'The IP Crawl catalog by the numbers: breakdowns by country, network and manufacturer.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})

const hasData = computed(() => (data.value?.totals.cams ?? 0) > 0)

// Deterministic UTC formatting so SSR and client hydrate identically.
const updatedLabel = computed(() => {
  const ts = data.value?.generatedAt
  if (!ts) return null
  return `${new Date(ts).toISOString().replace('T', ' ').slice(0, 16)} UTC`
})
</script>

<template>
  <div class="stats-page">
    <div class="stats-page__inner">
      <header class="stats-page__header">
        <!-- div, not h1 — "Network stats" below owns the page heading. -->
        <IpcrawlLogo tag="div" />
        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="sm"
        >
          Back to app
        </UButton>
      </header>

      <main class="stats-body">
        <h1 class="stats-title">
          Network stats
        </h1>
        <p class="stats-subtitle">
          Breakdown by country, network, and manufacturer.
          <span
            v-if="updatedLabel"
            class="stats-subtitle__stamp"
          >data as of {{ updatedLabel }}</span>
        </p>

        <template v-if="hasData && data">
          <div class="stats-tiles">
            <StatsTile
              label="Cameras"
              :value="data.totals.cams"
              hint="endpoints in the catalog"
            />
            <StatsTile
              label="Live now"
              :value="data.totals.live"
              live
              hint="answering a direct probe"
            />
            <StatsTile
              label="Countries"
              :value="data.totals.countries"
              hint="distinct geolocations"
            />
            <StatsTile
              label="Networks"
              :value="data.totals.orgs"
              hint="distinct ISPs / orgs"
            />
          </div>

          <section
            v-if="history?.points.length"
            class="stats-section"
          >
            <header class="stats-section__head">
              <h2 class="stats-section__title">
                Catalog size over time
              </h2>
            </header>
            <div class="stats-panel">
              <StatsTrend :points="history.points" />
            </div>
          </section>

          <section class="stats-section">
            <header class="stats-section__head">
              <h2 class="stats-section__title">
                By country
              </h2>
              <span class="stats-section__legend">
                <span class="stats-section__key stats-section__key--total" /> cataloged
                <span class="stats-section__key stats-section__key--live" /> live now
              </span>
            </header>
            <div class="stats-panel">
              <StatsBarList
                :items="data.countries"
                :total="data.totals.cams"
              />
            </div>
          </section>

          <section class="stats-section">
            <header class="stats-section__head">
              <h2 class="stats-section__title">
                By ISP
              </h2>
              <span class="stats-section__note">top {{ data.orgs.length }} of {{ data.totals.orgs.toLocaleString('en-US') }} ISPs &amp; hosting orgs</span>
            </header>
            <div class="stats-panel">
              <StatsBarList
                :items="data.orgs"
                :total="data.totals.cams"
              />
            </div>
          </section>

          <section
            v-if="(data.manufacturers?.length ?? 0) > 0"
            class="stats-section"
          >
            <header class="stats-section__head">
              <h2 class="stats-section__title">
                By manufacturer
              </h2>
            </header>
            <div class="stats-panel">
              <StatsBarList
                :items="data.manufacturers ?? []"
                :total="data.totals.cams"
              />
            </div>
          </section>

          <section class="stats-section">
            <header class="stats-section__head">
              <h2 class="stats-section__title">
                Crawler status
              </h2>
            </header>

            <ExploreSyncCountdown
              large
              class="stats-sync"
            />
          </section>
        </template>

        <div
          v-else
          class="stats-empty"
        >
          <p v-if="error">
            Stats are unavailable right now. Try again in a moment.
          </p>
          <p v-else>
            No data yet — the catalog fills in after the first refresh.
          </p>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* The base app pins body to a fixed, non-scrolling surface; this page owns its
   own scroll context (same pattern as /about). */
.stats-page {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.stats-page__inner {
  max-width: 880px;
  margin: 0 auto;
  padding: clamp(12px, 1.6vw, 18px) clamp(18px, 5vw, 32px) 120px;
  /* Morphs against the catalogue's 1600px shell on route changes. */
  view-transition-name: page-shell;
}

.stats-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: clamp(10px, 1.4vw, 14px);
  margin-bottom: clamp(24px, 4vw, 44px);
  border-bottom: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  view-transition-name: page-header;
}

.stats-body {
  animation: stats-rise 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes stats-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.stats-title {
  margin: 0;
  font-size: clamp(28px, 5vw, 40px);
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.1;
  color: var(--text, #f4f6f5);
}

.stats-title::after {
  content: "";
  display: block;
  width: 40px;
  height: 2px;
  margin-top: 22px;
  background: var(--phosphor);
}

.stats-subtitle {
  margin: 18px 0 0;
  max-width: 56ch;
  font-size: 14.5px;
  line-height: 1.75;
  color: var(--text-dim, #8b9591);
}

.stats-subtitle__stamp {
  display: block;
  margin-top: 6px;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  color: var(--text-mute, #58615d);
}

.stats-tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: clamp(26px, 4vw, 40px);
}

@media (max-width: 720px) {
  .stats-tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Matches the 12px tile gap so the sync card reads as part of the grid. */
.stats-sync {
  margin-top: 12px;
}

.stats-section {
  margin-top: clamp(30px, 4.4vw, 48px);
  min-width: 0;
}

.stats-section__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.stats-section__title {
  margin: 0;
  font-size: clamp(15px, 2.2vw, 18px);
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--text, #f4f6f5);
}

.stats-section__note {
  font-size: 11px;
  letter-spacing: 0.03em;
  color: var(--text-mute, #58615d);
  text-align: right;
}

.stats-section__legend {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: var(--text-mute, #58615d);
}

.stats-section__key {
  width: 14px;
  height: 7px;
  border-radius: 3px;
}

.stats-section__key--total {
  background: linear-gradient(90deg, rgb(var(--phosphor-rgb) / 0.22), rgb(var(--phosphor-rgb) / 0.78));
}

.stats-section__key--live {
  margin-left: 10px;
  background: var(--phosphor-bright);
}

.stats-panel {
  padding: clamp(16px, 2.4vw, 24px);
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 16px;
  background: var(--glass, rgba(12, 17, 16, 0.55));
}

.stats-empty {
  margin-top: clamp(30px, 4.4vw, 48px);
  padding: 38px 24px;
  text-align: center;
  border: 1px dashed var(--hairline-strong, rgba(255, 255, 255, 0.16));
  border-radius: 16px;
  color: var(--text-dim, #8b9591);
  font-size: 14px;
}
</style>
