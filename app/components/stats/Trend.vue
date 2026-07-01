<script setup lang="ts">
import type { StatsSnapshotPoint } from '#shared/stats'

const props = defineProps<{
  points: StatsSnapshotPoint[]
}>()

// SVG viewBox — generous width so gridlines + x-axis labels stay legible
// even when the panel narrows. Scales fluidly via CSS width.
const W = 720
const H = 200
const PAD_T = 16
const PAD_B = 34
const PAD_L = 8
const PAD_R = 8

const innerW = W - PAD_L - PAD_R
const innerH = H - PAD_T - PAD_B

const series = computed<StatsSnapshotPoint[]>(() => props.points
  .map(p => ({
    ts: Number(p.ts),
    count: Number(p.count),
    live: Number(p.live)
  }))
  .filter(p => Number.isFinite(p.ts) && Number.isFinite(p.count) && Number.isFinite(p.live))
  .sort((a, b) => a.ts - b.ts))

// Frame the visible band tightly around the actual values (with a little
// head/footroom) rather than anchoring at zero. A ~14k catalogue that only
// drifts by a few hundred would otherwise flatten into a solid block with a
// flat line pinned to the top — reading as a single point — so this lets the
// real movement between snapshots actually show.
const band = computed(() => {
  const counts = series.value.map(p => p.count)
  const hi = counts.length ? Math.max(...counts) : 1
  const lo = counts.length ? Math.min(...counts) : 0
  const pad = Math.max(1, (hi - lo) * 0.25)
  return { top: hi + pad, bottom: Math.max(0, lo - pad) }
})

function y(count: number): number {
  const span = Math.max(1, band.value.top - band.value.bottom)
  const norm = (count - band.value.bottom) / span
  return PAD_T + innerH * (1 - norm)
}

function x(i: number): number {
  if (series.value.length <= 1) return PAD_L + innerW / 2
  return PAD_L + (innerW * i) / (series.value.length - 1)
}

const linePath = computed(() => {
  if (series.value.length === 0) return ''
  return series.value
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(p.count).toFixed(2)}`)
    .join(' ')
})

const areaPath = computed(() => {
  if (series.value.length === 0) return ''
  const baseY = PAD_T + innerH
  const first = `${x(0).toFixed(2)} ${baseY}`
  const last = `${x(series.value.length - 1).toFixed(2)} ${baseY}`
  return `M ${first} ` + series.value
    .map((p, i) => `L ${x(i).toFixed(2)} ${y(p.count).toFixed(2)}`)
    .join(' ') + ` L ${last} Z`
})

// X-axis: a handful of evenly-spaced, human-labelled ticks whose granularity
// adapts to whatever window the data spans — months once the series matures,
// days/times while it's still filling in — so the axis never reads as bare
// (all snapshots in one month) or overcrowded. Ticks sit on real points, so
// they always line up with the index-spaced line.
const DAY_MS = 24 * 60 * 60 * 1000
const axisTicks = computed(() => {
  const pts = series.value
  if (pts.length < 2) return []
  const span = pts[pts.length - 1]!.ts - pts[0]!.ts
  const fmt: Intl.DateTimeFormatOptions = span >= 60 * DAY_MS
    ? { month: 'short', timeZone: 'UTC' }
    : span >= 2 * DAY_MS
      ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
      : { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }
  const want = Math.min(5, pts.length)
  const ticks: { x: number, label: string }[] = []
  const seen = new Set<string>()
  for (let k = 0; k < want; k++) {
    const i = Math.round((k * (pts.length - 1)) / (want - 1))
    const label = new Date(pts[i]!.ts).toLocaleString('en-US', fmt)
    // Collapse repeats (e.g. two evenly-spaced picks landing in the same month).
    if (seen.has(label)) continue
    seen.add(label)
    ticks.push({ x: x(i), label })
  }
  return ticks
})

const peak = computed(() => {
  if (series.value.length === 0) return null
  let best = series.value[0]!
  for (const p of series.value) if (p.count > best.count) best = p
  return best
})

function compact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })
}
</script>

<template>
  <div
    v-if="series.length >= 2"
    class="trend"
  >
    <svg
      class="trend__chart"
      viewBox="0 0 720 200"
      preserveAspectRatio="none"
      role="img"
      aria-label="Cataloged cameras over the past 12 months"
    >
      <defs>
        <linearGradient
          id="trend-area"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stop-color="rgb(var(--phosphor-rgb) / 0.42)"
          />
          <stop
            offset="100%"
            stop-color="rgb(var(--phosphor-rgb) / 0.02)"
          />
        </linearGradient>
      </defs>

      <!-- Adaptive gridlines + x-axis labels -->
      <g class="trend__grid">
        <line
          v-for="tick in axisTicks"
          :key="`g-${tick.label}-${tick.x}`"
          :x1="tick.x"
          :x2="tick.x"
          :y1="PAD_T"
          :y2="PAD_T + innerH"
        />
      </g>
      <g class="trend__x-labels">
        <text
          v-for="tick in axisTicks"
          :key="`x-${tick.label}-${tick.x}`"
          :x="tick.x"
          :y="H - 12"
          text-anchor="middle"
        >{{ tick.label }}</text>
      </g>

      <path
        class="trend__area"
        :d="areaPath"
        fill="url(#trend-area)"
      />
      <path
        class="trend__line"
        :d="linePath"
        fill="none"
        stroke="var(--phosphor-bright)"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      />

      <!-- Visible markers make sparse histories (the first few syncs) read as multiple snapshots. -->
      <g class="trend__points">
        <circle
          v-for="(p, i) in series"
          :key="`p-${p.ts}-${i}`"
          :cx="x(i)"
          :cy="y(p.count)"
          r="3.25"
        />
      </g>

      <!-- Peak marker: a phosphor dot + count label anchored above it. -->
      <g
        v-if="peak"
        :transform="`translate(${x(series.indexOf(peak))} ${y(peak.count)})`"
        class="trend__peak"
      >
        <circle r="3" />
        <text
          y="-8"
          text-anchor="middle"
          class="trend__peak-label"
        >{{ compact(peak.count) }}</text>
        <title>{{ fmtDate(peak.ts) }} — {{ peak.count.toLocaleString('en-US') }} cameras</title>
      </g>

      <!-- Per-point hover hit-areas (invisible circles with <title> tooltips). -->
      <g class="trend__hits">
        <circle
          v-for="(p, i) in series"
          :key="`h-${p.ts}-${i}`"
          :cx="x(i)"
          :cy="y(p.count)"
          r="8"
          fill="transparent"
        ><title>{{ fmtDate(p.ts) }} — {{ p.count.toLocaleString('en-US') }} cameras ({{ p.live.toLocaleString('en-US') }} live)</title></circle>
      </g>
    </svg>

    <div class="trend__meta">
      <span class="trend__caption">
        <UIcon
          name="i-lucide-target"
          class="trend__caption-icon"
        />
        Target by 2027: 0
      </span>

      <span
        v-if="peak"
        class="trend__peak-note"
      >Peak: {{ peak.count.toLocaleString('en-US') }} on {{ fmtDate(peak.ts) }}</span>
    </div>
  </div>

  <div
    v-else
    class="trend trend--empty"
  >
    <UIcon
      name="i-lucide-line-chart"
      class="trend__empty-icon"
    />
    <p class="trend__empty-title">
      No history yet
    </p>
    <p class="trend__empty-hint">
      The rolling 12-month chart fills in as scheduled scans record the catalogue size.
    </p>
  </div>
</template>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trend__chart {
  width: 100%;
  height: clamp(140px, 22vw, 220px);
  display: block;
}

/* Gridlines + axis text share the same mute token as the other stats panels. */
.trend__grid line {
  stroke: rgba(255, 255, 255, 0.05);
  stroke-width: 1;
}

.trend__x-labels text {
  font-size: 10px;
  fill: var(--text-mute, #58615d);
  font-variant-numeric: tabular-nums;
}

.trend__line {
  animation: trend-draw 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
  vector-effect: non-scaling-stroke;
}

.trend__area {
  opacity: 0;
  animation: trend-fade 700ms ease 200ms both;
}

.trend__points circle {
  fill: var(--phosphor-bright);
  stroke: var(--bg-0, #07100e);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.trend__hits circle {
  pointer-events: all;
}

@keyframes trend-draw {
  from {
    stroke-dasharray: 2000;
    stroke-dashoffset: 2000;
  }
  to {
    stroke-dasharray: 2000;
    stroke-dashoffset: 0;
  }
}

@keyframes trend-fade {
  to {
    opacity: 1;
  }
}

.trend__peak circle {
  fill: var(--phosphor-bright);
}

.trend__peak-label {
  font-size: 11px;
  font-weight: 700;
  fill: var(--text, #f4f6f5);
  font-variant-numeric: tabular-nums;
}

.trend__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  color: var(--text-mute, #58615d);
}

.trend__pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.trend__pill-key {
  width: 14px;
  height: 7px;
  border-radius: 3px;
  background: linear-gradient(90deg, rgb(var(--phosphor-rgb) / 0.22), var(--phosphor-bright));
}

.trend__peak-note {
  font-variant-numeric: tabular-nums;
}

.trend__caption {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-mute, #58615d);
}

.trend__caption-icon {
  flex: none;
  width: 13px;
  height: 13px;
  color: var(--phosphor);
}

.trend--empty {
  padding: 36px 24px;
  align-items: center;
  text-align: center;
}

.trend__empty-icon {
  width: 28px;
  height: 28px;
  color: var(--phosphor-soft);
}

.trend__empty-title {
  margin: 6px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #f4f6f5);
}

.trend__empty-hint {
  margin: 2px 0 0;
  max-width: 38ch;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-dim, #8b9591);
}
</style>
