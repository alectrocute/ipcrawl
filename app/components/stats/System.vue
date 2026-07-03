<script setup lang="ts">
import type { SystemStatsResponse } from '#shared/stats'
import { API_STATS_SYSTEM } from '#shared/routes'

defineOptions({ name: 'StatsSystem' })

// Live VPS host metrics. Client-only fetch — RPS is a live signal, so skipping
// SSR sidesteps hydration drift on the numbers. The shell reserves the space
// (skeleton bars) so layout doesn't shift when the first sample lands.
const { data, refresh } = useFetch<SystemStatsResponse>(API_STATS_SYSTEM, {
  server: false,
  lazy: true
})

// 5s poll mirrors the route-rule SWR, so each refresh is an edge hit, not
// origin work. Pauses on hidden tabs to avoid wasted polls.
let timer: number | undefined
function onVisible(): void {
  if (document.visibilityState !== 'visible') return
  refresh()
}
onMounted(() => {
  timer = window.setInterval(refresh, 5000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 10e9 ? 0 : 1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 10e6 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(n / 1e3))} KB`
}

function fmtPct(frac: number): string {
  return `${(frac * 100).toFixed(frac < 0.1 ? 1 : 0)}%`
}

const memBarPct = computed(() => {
  const frac = data.value?.memory.usedFraction ?? 0
  return `${Math.min(Math.max(frac, 0), 1) * 100}%`
})
const cpuBarPct = computed(() => {
  const frac = data.value?.cpu.loadFraction ?? 0
  // load1 can exceed cores (queue depth > capacity); cap the bar at 100%.
  return `${Math.min(Math.max(frac, 0), 1) * 100}%`
})
const rpsBarPct = computed(() => {
  const rps = data.value?.rps
  if (!rps || rps.peak <= 0) return '0%'
  return `${Math.min((rps.current / rps.peak) * 100, 100)}%`
})

function fmtUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const d = Math.floor(sec / 86_400)
  const h = Math.floor((sec % 86_400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
</script>

<template>
  <div class="sys">
    <div class="sys__row">
      <div class="sys__head">
        <span class="sys__label">Memory</span>
        <span class="sys__value">
          {{ data ? `${fmtBytes(data.memory.usedBytes)} / ${fmtBytes(data.memory.totalBytes)}` : '— / —' }}
        </span>
        <span class="sys__note">{{ data ? fmtPct(data.memory.usedFraction) : '—' }}</span>
      </div>
      <div class="sys__track">
        <div
          class="sys__fill"
          :style="{ width: memBarPct }"
        />
      </div>
      <div class="sys__sub">
        node rss {{ data ? fmtBytes(data.memory.rssBytes) : '—' }}
        · heap {{ data ? fmtBytes(data.memory.heapUsedBytes) : '—' }} / {{ data ? fmtBytes(data.memory.heapTotalBytes) : '—' }}
      </div>
    </div>

    <div class="sys__row">
      <div class="sys__head">
        <span class="sys__label">CPU load</span>
        <span class="sys__value">{{ data ? data.cpu.load1.toFixed(2) : '—' }}</span>
        <span class="sys__note">
          {{ data ? `${data.cpu.cores} core${data.cpu.cores === 1 ? '' : 's'}` : '—' }}
        </span>
      </div>
      <div class="sys__track">
        <div
          class="sys__fill"
          :style="{ width: cpuBarPct }"
        />
      </div>
      <div class="sys__sub">
        5m {{ data ? data.cpu.load5.toFixed(2) : '—' }}
        · 15m {{ data ? data.cpu.load15.toFixed(2) : '—' }}
        · {{ data ? fmtPct(Math.min(data.cpu.loadFraction, 1)) : '—' }} of capacity
      </div>
    </div>

    <div class="sys__row">
      <div class="sys__head">
        <span class="sys__label">Requests / second</span>
        <span class="sys__value">{{ data ? data.rps.current.toFixed(1) : '—' }}</span>
        <span class="sys__note">60s avg</span>
      </div>
      <div class="sys__track">
        <div
          class="sys__fill"
          :style="{ width: rpsBarPct }"
        />
      </div>
      <div class="sys__sub">
        peak {{ data ? data.rps.peak.toFixed(0) : '—' }}/s
        · total {{ data ? data.rps.total.toLocaleString('en-US') : '—' }}
        · up {{ data ? fmtUptime(data.rps.uptimeSec) : '—' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.sys {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: clamp(16px, 2.4vw, 24px);
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 16px;
  background: var(--glass, rgba(12, 17, 16, 0.55));
  margin-top: 12px;
}

.sys__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sys__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.sys__label {
  flex: none;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-mute, #58615d);
}

.sys__value {
  margin-left: auto;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text, #f4f6f5);
}

.sys__note {
  flex: none;
  min-width: 56px;
  text-align: right;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--phosphor);
  font-weight: 700;
}

.sys__track {
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.sys__fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    rgb(var(--phosphor-rgb) / 0.22) 0%,
    rgb(var(--phosphor-rgb) / 0.78) 100%
  );
  /* Smooth width changes between 5s polls; no entrance animation so the panel
     doesn't clash with the page transition (see logo-flash fix on the charts). */
  transition: width 400ms cubic-bezier(0.22, 1, 0.36, 1);
}

.sys__sub {
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: 0.02em;
  color: var(--text-mute, #58615d);
  font-variant-numeric: tabular-nums;
}
</style>
