<script setup lang="ts">
import type { RefreshStatusResponse } from '#shared/status'
import { API_REFRESH_STATUS } from '#shared/routes'

defineOptions({ name: 'ExploreSyncCountdown' })

// `large` renders the stats-page hero variant: same data and states, scaled
// up to hold its own next to the stat tiles.
const props = withDefaults(defineProps<{ large?: boolean }>(), { large: false })

// The compact sidebar card doubles as a shortcut into the full stats page. The
// large hero variant already lives *on* that page, so it stays a plain aside.
const NuxtLink = resolveComponent('NuxtLink')
const rootTag = computed(() => (props.large ? 'aside' : NuxtLink))

// The Shodan sweep runs on a daily cron (`0 0 * * *` in nuxt.config /
// wrangler), i.e. at fixed UTC wall-clock boundary 00:00. The countdown
// targets the next boundary *after* the last completed run. Anchoring to the
// cron grid — not lastAt + 24h — keeps the estimate honest after manual
// refreshes: a manual run at 14:30 doesn't push the next cron sweep to 14:30
// tomorrow, it still fires at 00:00 UTC.
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000
// Inside this window the bar flips from countdown to the anticipatory scan.
const IMMINENT_WINDOW_MS = 5 * 60 * 1000

// Client-only fetch: everything this card renders is time-relative, so
// skipping SSR sidesteps hydration drift entirely (the shell below reserves
// the space; the numbers fade in on mount). /api/refresh/status reports the
// in-flight run from the task's KV log, so "Syncing now" reflects a real
// running job (cron or manual), not just the wall clock.
const { data, refresh } = useFetch<RefreshStatusResponse>(API_REFRESH_STATUS, {
  server: false,
  lazy: true
})

const now = ref(0)

const lastAt = computed(() => {
  const iso = data.value?.refreshedAt
  if (!iso) return null
  const ts = Date.parse(iso)
  return Number.isFinite(ts) ? ts : null
})

// A confirmed in-flight run, with its start time for the elapsed readout.
const syncing = computed(() => data.value?.running === true)

const runStartedAt = computed(() => {
  const iso = data.value?.runStartedAt
  if (!iso) return null
  const ts = Date.parse(iso)
  return Number.isFinite(ts) ? ts : null
})

// Next cron firing strictly after the last run. Epoch ms are UTC-based and
// 24 % 24 === 0, so flooring to 24h periods lands exactly on the cron's UTC
// boundary. A cron run stamps refreshedAt a hair past its own boundary, so
// "strictly after" naturally yields boundary + 24h for cron runs and the very
// next boundary for manual ones.
const targetAt = computed(() =>
  lastAt.value === null
    ? null
    : (Math.floor(lastAt.value / REFRESH_INTERVAL_MS) + 1) * REFRESH_INTERVAL_MS
)

const ready = computed(() => now.value > 0 && targetAt.value !== null)

const remainingMs = computed(() =>
  targetAt.value === null ? 0 : targetAt.value - now.value
)

// Anticipatory state: a run is *due* (clock-based) but not yet confirmed
// running. Distinct from `syncing`, which is evidence-based.
const imminent = computed(() =>
  !syncing.value && ready.value && remainingMs.value <= IMMINENT_WINDOW_MS
)
const overdue = computed(() => ready.value && remainingMs.value <= 0)
// Either flavor of "the sweep is happening / about to" — drives the scan bar
// and the powered-up card styling.
const active = computed(() => syncing.value || imminent.value)

const progressPct = computed(() => {
  if (!ready.value || lastAt.value === null || targetAt.value === null) return 0
  // The bar spans last run → next cron boundary. After a manual refresh that
  // window is shorter than 24h, so the fill still reads "fresh data, sync due
  // at the boundary" rather than pretending a full cycle remains.
  const windowMs = Math.max(targetAt.value - lastAt.value, 1)
  const elapsed = windowMs - remainingMs.value
  return Math.min(Math.max(elapsed / windowMs, 0), 1) * 100
})

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function clockFormat(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const countdown = computed(() => clockFormat(remainingMs.value))

// While a run is in flight the headline counts *up* from the run's start.
const elapsedLabel = computed(() =>
  runStartedAt.value === null ? null : clockFormat(now.value - runStartedAt.value)
)

const lastLabel = computed(() => {
  if (lastAt.value === null) return null
  const d = new Date(lastAt.value)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
})

let tickTimer: number | undefined
let pollTimer: number | undefined

function onVisible(): void {
  // Background tabs throttle timers; snap the clock (and possibly the data)
  // forward the moment the tab is looked at again.
  if (document.visibilityState !== 'visible') return
  now.value = Date.now()
  if (active.value) refresh()
}

onMounted(() => {
  now.value = Date.now()
  tickTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
  // Re-poll while a run is in flight (to catch its completion) or near the
  // expected cron firing (to catch its start — including manual runs at any
  // time). The route has a 10s SWR window, so polls are edge hits, not
  // KV/D1 work.
  pollTimer = window.setInterval(() => {
    if (syncing.value || remainingMs.value <= 10 * 60 * 1000) refresh()
  }, 15_000)
  document.addEventListener('visibilitychange', onVisible)
})

onBeforeUnmount(() => {
  if (tickTimer !== undefined) window.clearInterval(tickTimer)
  if (pollTimer !== undefined) window.clearInterval(pollTimer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <component
    :is="rootTag"
    v-bind="large ? {} : { 'to': '/stats', 'aria-label': 'View catalog stats' }"
    class="sync"
    :class="{ 'sync--imminent': active, 'sync--large': large, 'sync--link': !large }"
    aria-live="off"
  >
    <div class="sync__head">
      <span class="sync__label">
        <span
          class="sync__dot"
          aria-hidden="true"
        />
        <!-- "Syncing now" only when the task log confirms an in-flight run;
             a merely-due run reads as anticipatory, not in-progress. -->
        {{ syncing ? 'Syncing now' : imminent ? 'Sync due' : 'Next sync' }}
      </span>
      <span class="sync__time">
        <template v-if="syncing">{{ elapsedLabel ?? 'live' }}</template>
        <template v-else-if="!ready">--:--</template>
        <template v-else-if="overdue">any moment</template>
        <template v-else>{{ countdown }}</template>
      </span>
    </div>

    <div class="sync__track">
      <!-- Countdown mode: fill creeps toward the next run, shimmer drifting
           across it so the bar reads as alive even at a glance. -->
      <div
        v-if="!active"
        class="sync__fill"
        :style="{ width: `${progressPct}%` }"
      >
        <span
          class="sync__shimmer"
          aria-hidden="true"
        />
      </div>
      <!-- In-flight / anticipatory mode: indeterminate radar sweep. -->
      <div
        v-else
        class="sync__scan"
        aria-hidden="true"
      />
    </div>

    <div class="sync__foot">
      <span>{{ lastLabel ? `last ${lastLabel}` : 'awaiting first sync' }}</span>
      <span>daily cycle</span>
    </div>
  </component>
</template>

<style scoped>
.sync {
  position: relative;
  padding: 13px 16px 12px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  background: var(--glass, rgba(12, 17, 16, 0.55));
  transition: border-color 400ms ease;
}

/* Compact card is a shortcut into the stats page. Hover brightens the surface
   only (the border is owned by the imminent state, so leave it be). */
.sync--link {
  display: block;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}

.sync--link:hover {
  background: var(--glass-strong, rgba(12, 17, 16, 0.72));
}

.sync--link:focus-visible {
  outline: 2px solid var(--phosphor);
  outline-offset: 2px;
}

/* Imminent: the whole card powers up — phosphor border. */
.sync--imminent {
  border-color: var(--phosphor-soft);
}

.sync__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.sync__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-mute, #58615d);
  transition: color 400ms ease;
}

.sync--imminent .sync__label {
  color: var(--phosphor);
}

.sync__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-mute, #58615d);
  transition: background 400ms ease;
}

.sync--imminent .sync__dot {
  background: var(--phosphor);
  animation: sync-dot-pulse 1s ease-in-out infinite;
}

@keyframes sync-dot-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(0.7);
  }
}

.sync__time {
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text, #f4f6f5);
}

.sync--imminent .sync__time {
  color: var(--phosphor-bright);
}

.sync__track {
  position: relative;
  height: 6px;
  margin-top: 10px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.sync__fill {
  position: relative;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    rgb(var(--phosphor-rgb) / 0.18) 0%,
    rgb(var(--phosphor-rgb) / 0.75) 100%
  );
  /* The 1s tick nudges the width imperceptibly; the long transition makes the
     initial mount sweep (0 → elapsed) feel deliberate rather than a snap. */
  transition: width 900ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* Bright leading edge so the head of the fill reads as the "now" cursor. */
.sync__fill::after {
  content: "";
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 7px;
  border-radius: 3px;
  background: var(--phosphor-bright);
}

/* Slow shimmer drifting along the elapsed portion. */
.sync__shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.22) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: sync-shimmer 3.4s linear infinite;
}

@keyframes sync-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

/* Indeterminate radar sweep for the anticipatory state. */
.sync__scan {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -40%;
  width: 40%;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--phosphor) 55%,
    var(--phosphor-bright) 100%
  );
  animation: sync-scan 1.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

@keyframes sync-scan {
  from {
    left: -40%;
  }
  to {
    left: 100%;
  }
}

.sync__foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--text-mute, #58615d);
  font-variant-numeric: tabular-nums;
}

/* ---- Large variant (stats page) ------------------------------------- */
/* Same anatomy, scaled up: the countdown becomes the headline number and
   the track thickens to match the heavier type. */

.sync--large {
  padding: clamp(18px, 2.6vw, 26px) clamp(18px, 2.8vw, 28px) clamp(14px, 2vw, 20px);
  border-radius: 16px;
}

.sync--large .sync__head {
  gap: 16px;
}

.sync--large .sync__label {
  font-size: 11px;
  letter-spacing: 0.18em;
  gap: 9px;
}

.sync--large .sync__dot {
  width: 7px;
  height: 7px;
}

.sync--large .sync__time {
  font-size: clamp(26px, 4.6vw, 38px);
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1;
}

.sync--large .sync__track {
  height: 10px;
  margin-top: 16px;
  border-radius: 5px;
}

.sync--large .sync__fill,
.sync--large .sync__scan {
  border-radius: 5px;
}

.sync--large .sync__fill::after {
  width: 9px;
  border-radius: 5px;
}

.sync--large .sync__foot {
  margin-top: 11px;
  font-size: 11.5px;
}
</style>
