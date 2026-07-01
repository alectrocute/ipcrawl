<script setup lang="ts">
defineOptions({ name: 'GuessMap' })

interface Props {
  // The player's current pin (lat/lon), or null if none placed yet.
  guess?: { lat: number, lon: number } | null
  // When revealed, the true location to draw + connect with the guess.
  actual?: { lat: number, lon: number } | null
  revealed?: boolean
  interactive?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  guess: null,
  actual: null,
  revealed: false,
  interactive: true
})

const emit = defineEmits<{
  (e: 'place', payload: { lat: number, lon: number }): void
}>()

// Equirectangular world, identical projection to the minimap so the same
// world-path asset lines up perfectly.
const WORLD_W = 1000
const WORLD_H = 500
const MIN_W = WORLD_W / 14 // deepest zoom
const MAX_W = WORLD_W // fully zoomed out

const worldPath = ref('')
onMounted(async () => {
  const mod = await import('#shared/worldPath')
  worldPath.value = mod.WORLD_PATH
})

function project(lat: number, lon: number) {
  return {
    x: ((lon + 180) * WORLD_W) / 360,
    y: ((90 - lat) * WORLD_H) / 180
  }
}

function unproject(x: number, y: number) {
  return {
    lon: (x / WORLD_W) * 360 - 180,
    lat: 90 - (y / WORLD_H) * 180
  }
}

const guessPt = computed(() => (props.guess ? project(props.guess.lat, props.guess.lon) : null))
const actualPt = computed(() =>
  props.revealed && props.actual ? project(props.actual.lat, props.actual.lon) : null
)

// Uniform zoom keeps width:height locked at 2:1 so it always matches the
// container's aspect-ratio — letting us use a linear (non-distorting) mapping
// between client pixels and SVG user units.
const view = reactive({ x: 0, y: 0, w: WORLD_W, h: WORLD_H })
const viewBoxStr = computed(() =>
  `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.w.toFixed(2)} ${view.h.toFixed(2)}`
)

const svgEl = ref<SVGSVGElement | null>(null)

function clampView() {
  view.w = Math.min(MAX_W, Math.max(MIN_W, view.w))
  view.h = view.w / 2
  view.x = Math.min(WORLD_W - view.w, Math.max(0, view.x))
  view.y = Math.min(WORLD_H - view.h, Math.max(0, view.y))
}

function clientToWorld(clientX: number, clientY: number) {
  const el = svgEl.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const px = (clientX - rect.left) / rect.width
  const py = (clientY - rect.top) / rect.height
  return {
    x: view.x + px * view.w,
    y: view.y + py * view.h,
    px,
    py
  }
}

// --- Zoom ----------------------------------------------------------------
function zoomBy(factor: number, anchorPx: number, anchorPy: number) {
  const ux = view.x + anchorPx * view.w
  const uy = view.y + anchorPy * view.h
  view.w = Math.min(MAX_W, Math.max(MIN_W, view.w * factor))
  view.h = view.w / 2
  view.x = ux - anchorPx * view.w
  view.y = uy - anchorPy * view.h
  clampView()
}

function onWheel(e: WheelEvent) {
  if (!props.interactive) return
  e.preventDefault()
  const w = clientToWorld(e.clientX, e.clientY)
  if (!w) return
  zoomBy(e.deltaY < 0 ? 0.82 : 1.22, w.px, w.py)
}

function zoomButton(dir: 1 | -1) {
  zoomBy(dir === 1 ? 0.7 : 1.43, 0.5, 0.5)
}

// --- Pan + click ---------------------------------------------------------
const dragging = ref(false)
let pointerId: number | null = null
let downX = 0
let downY = 0
let movedDistance = 0
let panStart = { x: 0, y: 0 }

function onPointerDown(e: PointerEvent) {
  if (!props.interactive) return
  pointerId = e.pointerId
  dragging.value = true
  downX = e.clientX
  downY = e.clientY
  movedDistance = 0
  panStart = { x: view.x, y: view.y }
  ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pointerId) return
  const el = svgEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const dx = e.clientX - downX
  const dy = e.clientY - downY
  movedDistance = Math.max(movedDistance, Math.hypot(dx, dy))
  // Translate the view opposite to the drag, scaled into user units.
  view.x = panStart.x - (dx / rect.width) * view.w
  view.y = panStart.y - (dy / rect.height) * view.h
  clampView()
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  dragging.value = false
  pointerId = null
  if (!props.interactive) return
  // A small movement counts as a click → drop a pin.
  if (movedDistance < 5) {
    const w = clientToWorld(e.clientX, e.clientY)
    if (w) {
      const { lat, lon } = unproject(w.x, w.y)
      emit('place', { lat, lon })
    }
  }
}

// --- Reveal framing ------------------------------------------------------
let rafId: number | null = null
function animateTo(target: { x: number, y: number, w: number, h: number }) {
  if (rafId !== null) cancelAnimationFrame(rafId)
  const start = { x: view.x, y: view.y, w: view.w, h: view.h }
  const t0 = performance.now()
  const dur = 700
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / dur)
    const e = 1 - Math.pow(1 - t, 3)
    view.x = start.x + (target.x - start.x) * e
    view.y = start.y + (target.y - start.y) * e
    view.w = start.w + (target.w - start.w) * e
    view.h = start.h + (target.h - start.h) * e
    if (t < 1) rafId = requestAnimationFrame(step)
    else rafId = null
  }
  rafId = requestAnimationFrame(step)
}

function fitPoints() {
  const g = guessPt.value
  const a = actualPt.value
  if (!g || !a) return
  const minX = Math.min(g.x, a.x)
  const maxX = Math.max(g.x, a.x)
  const minY = Math.min(g.y, a.y)
  const maxY = Math.max(g.y, a.y)
  const padX = Math.max((maxX - minX) * 0.4, 60)
  const padY = Math.max((maxY - minY) * 0.4, 30)
  let w = Math.max((maxX - minX) + padX * 2, (maxY - minY + padY * 2) * 2)
  w = Math.min(MAX_W, Math.max(MIN_W, w))
  const h = w / 2
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const target = {
    x: Math.min(WORLD_W - w, Math.max(0, cx - w / 2)),
    y: Math.min(WORLD_H - h, Math.max(0, cy - h / 2)),
    w,
    h
  }
  animateTo(target)
}

watch(
  () => props.revealed,
  (revealed) => {
    if (revealed) nextTick(fitPoints)
  }
)

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
})

const connector = computed(() => {
  if (!guessPt.value || !actualPt.value) return null
  return { x1: guessPt.value.x, y1: guessPt.value.y, x2: actualPt.value.x, y2: actualPt.value.y }
})

// Keep markers a constant on-screen size regardless of zoom level.
const markerScale = computed(() => view.w / WORLD_W)
</script>

<template>
  <div class="guess-map">
    <svg
      ref="svgEl"
      class="guess-map__svg"
      :class="{ 'guess-map__svg--grab': interactive, 'guess-map__svg--grabbing': dragging }"
      :viewBox="viewBoxStr"
      preserveAspectRatio="none"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <rect
        :x="view.x"
        :y="view.y"
        :width="view.w"
        :height="view.h"
        fill="#040a07"
      />

      <!-- Subtle graticule for orientation. -->
      <g class="guess-map__grid">
        <line
          v-for="lon in [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]"
          :key="`v${lon}`"
          :x1="((lon + 180) * WORLD_W) / 360"
          :x2="((lon + 180) * WORLD_W) / 360"
          :y1="0"
          :y2="WORLD_H"
        />
        <line
          v-for="lat in [-60, -30, 0, 30, 60]"
          :key="`h${lat}`"
          :x1="0"
          :x2="WORLD_W"
          :y1="((90 - lat) * WORLD_H) / 180"
          :y2="((90 - lat) * WORLD_H) / 180"
        />
      </g>

      <path
        :d="worldPath"
        class="guess-map__land"
        fill-rule="evenodd"
      />

      <!-- Great-circle-ish connector between guess and truth on reveal. -->
      <line
        v-if="connector"
        class="guess-map__connector"
        :x1="connector.x1"
        :y1="connector.y1"
        :x2="connector.x2"
        :y2="connector.y2"
      />

      <!-- Player's guess pin. -->
      <g
        v-if="guessPt"
        class="guess-map__pin guess-map__pin--guess"
        :transform="`translate(${guessPt.x}, ${guessPt.y}) scale(${markerScale})`"
      >
        <path
          class="guess-map__pin-body"
          d="M0 0 C -7 -12 -10 -18 -10 -24 A 10 10 0 1 1 10 -24 C 10 -18 7 -12 0 0 Z"
        />
        <circle
          class="guess-map__pin-hole"
          cx="0"
          cy="-24"
          r="4"
        />
      </g>

      <!-- True location (revealed). -->
      <g
        v-if="actualPt"
        class="guess-map__pin guess-map__pin--actual"
        :transform="`translate(${actualPt.x}, ${actualPt.y}) scale(${markerScale})`"
      >
        <circle
          class="guess-map__actual-pulse"
          cx="0"
          cy="0"
          r="6"
        />
        <path
          class="guess-map__pin-body"
          d="M0 0 C -7 -12 -10 -18 -10 -24 A 10 10 0 1 1 10 -24 C 10 -18 7 -12 0 0 Z"
        />
        <circle
          class="guess-map__pin-hole"
          cx="0"
          cy="-24"
          r="4"
        />
      </g>
    </svg>

    <div
      v-if="interactive"
      class="guess-map__zoom"
    >
      <button
        type="button"
        aria-label="Zoom in"
        @click="zoomButton(1)"
      >
        +
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        @click="zoomButton(-1)"
      >
        &minus;
      </button>
    </div>
  </div>
</template>

<style scoped>
.guess-map {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgb(var(--phosphor-rgb) / 0.32);
  background: #040a07;
}

.guess-map__svg {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.guess-map__svg--grab {
  cursor: crosshair;
}

.guess-map__svg--grabbing {
  cursor: grabbing;
}

.guess-map__grid line {
  stroke: rgb(var(--phosphor-rgb) / 0.08);
  stroke-width: 0.5;
  vector-effect: non-scaling-stroke;
}

.guess-map__land {
  fill: rgb(var(--phosphor-rgb) / 0.2);
  stroke: rgb(var(--phosphor-rgb) / 0.28);
  stroke-width: 0.4;
  vector-effect: non-scaling-stroke;
}

.guess-map__connector {
  stroke: rgba(255, 255, 255, 0.6);
  stroke-width: 1.4;
  stroke-dasharray: 4 4;
  vector-effect: non-scaling-stroke;
}

.guess-map__pin-body {
  stroke: rgba(0, 0, 0, 0.55);
  stroke-width: 1;
  paint-order: stroke;
}

.guess-map__pin-hole {
  fill: rgba(0, 0, 0, 0.65);
}

.guess-map__pin--guess .guess-map__pin-body {
  fill: var(--phosphor-bright);
}

.guess-map__pin--actual .guess-map__pin-body {
  fill: #ff5d6c;
}

.guess-map__actual-pulse {
  fill: rgba(255, 80, 100, 0.45);
  transform-box: fill-box;
  transform-origin: center;
  animation: guess-actual-pulse 1.6s ease-out infinite;
}

@keyframes guess-actual-pulse {
  0% {
    transform: scale(0.6);
    opacity: 0.7;
  }
  100% {
    transform: scale(3.4);
    opacity: 0;
  }
}

.guess-map__zoom {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.guess-map__zoom button {
  appearance: none;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgb(var(--phosphor-rgb) / 0.4);
  background: rgba(4, 14, 10, 0.85);
  color: var(--phosphor-bright);
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 140ms ease, border-color 140ms ease;
}

.guess-map__zoom button:hover {
  background: rgb(var(--phosphor-rgb) / 0.16);
  border-color: var(--phosphor);
}
</style>
