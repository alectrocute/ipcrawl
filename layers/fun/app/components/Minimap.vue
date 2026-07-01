<script setup lang="ts">
import { useViewportNudgedPopover } from '../composables/useViewportNudgedPopover'

// eslint-disable-next-line vue/multi-word-component-names
defineOptions({ name: 'Minimap' })

interface Props {
  lat: number | null
  lon: number | null
  visible: boolean
}
const props = defineProps<Props>()
const popover = ref<HTMLElement | null>(null)
const { popoverStyle } = useViewportNudgedPopover(popover, {
  visible: computed(() => props.visible),
  align: 'center'
})

// World geometry (~78KB raw / ~18KB gzipped) ships only after mount so SSR
// HTML stays lean. The bubble + marker render immediately; landmasses fade
// in once the chunk arrives.
const worldPath = ref('')
onMounted(async () => {
  const mod = await import('#shared/worldPath')
  worldPath.value = mod.WORLD_PATH
})

// World coordinate system. Equirectangular 1000x500. The SVG's viewBox is
// what we animate to "fly to" a location.
const WORLD_W = 1000
const WORLD_H = 500
// Lower zoom = more regional context, useful at small popover sizes.
const FOCUS_ZOOM = 3
const appConfig = useAppConfig()
const FLY_MS = appConfig.timing?.ui?.minimapFlyMs ?? 800

function project(lat: number, lon: number) {
  const x = (lon + 180) * WORLD_W / 360
  const y = (90 - lat) * WORLD_H / 180
  return { x, y }
}

const marker = computed(() => {
  if (props.lat == null || props.lon == null) return null
  return project(props.lat, props.lon)
})

function targetView(): { x: number, y: number, w: number, h: number } {
  if (!marker.value) return { x: 0, y: 0, w: WORLD_W, h: WORLD_H }
  const w = WORLD_W / FOCUS_ZOOM
  const h = WORLD_H / FOCUS_ZOOM
  const x = Math.max(0, Math.min(WORLD_W - w, marker.value.x - w / 2))
  const y = Math.max(0, Math.min(WORLD_H - h, marker.value.y - h / 2))
  return { x, y, w, h }
}

const view = ref(targetView())
const viewBoxStr = computed(() =>
  `${view.value.x.toFixed(2)} ${view.value.y.toFixed(2)} ${view.value.w.toFixed(2)} ${view.value.h.toFixed(2)}`
)

let rafId: number | null = null
function flyTo(target: ReturnType<typeof targetView>) {
  if (import.meta.server) {
    view.value = target
    return
  }
  if (rafId !== null) cancelAnimationFrame(rafId)
  const start = { ...view.value }
  const t0 = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / FLY_MS)
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    view.value = {
      x: start.x + (target.x - start.x) * e,
      y: start.y + (target.y - start.y) * e,
      w: start.w + (target.w - start.w) * e,
      h: start.h + (target.h - start.h) * e
    }
    if (t < 1) rafId = requestAnimationFrame(step)
    else rafId = null
  }
  rafId = requestAnimationFrame(step)
}

watch([() => props.lat, () => props.lon], () => flyTo(targetView()))

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
})

// Crosshair lines anchored on the marker, drawn in the current viewBox so
// they always span the visible area regardless of zoom.
const crosshair = computed(() => {
  if (!marker.value) return null
  return {
    x: marker.value.x,
    y: marker.value.y,
    x1: view.value.x,
    x2: view.value.x + view.value.w,
    y1: view.value.y,
    y2: view.value.y + view.value.h
  }
})
</script>

<template>
  <Transition name="minimap-pop">
    <div
      v-if="props.visible"
      ref="popover"
      class="minimap"
      :style="popoverStyle"
    >
      <div class="minimap__bubble">
        <svg
          :viewBox="viewBoxStr"
          preserveAspectRatio="xMidYMid slice"
          class="minimap__svg"
        >
          <rect
            :x="view.x"
            :y="view.y"
            :width="view.w"
            :height="view.h"
            fill="#040a07"
          />

          <path
            :d="worldPath"
            class="minimap__land"
            fill-rule="evenodd"
          />

          <g
            v-if="crosshair"
            class="minimap__crosshair"
          >
            <line
              :x1="crosshair.x"
              :x2="crosshair.x"
              :y1="crosshair.y1"
              :y2="crosshair.y2"
            />
            <line
              :y1="crosshair.y"
              :y2="crosshair.y"
              :x1="crosshair.x1"
              :x2="crosshair.x2"
            />
          </g>

          <g
            v-if="marker"
            class="minimap__marker"
            :transform="`translate(${marker.x}, ${marker.y})`"
          >
            <circle
              class="minimap__pulse"
              r="2"
            />
            <circle
              class="minimap__pulse minimap__pulse--delayed"
              r="2"
            />
            <circle
              class="minimap__dot"
              r="1.4"
            />
          </g>
        </svg>
      </div>

      <!-- Speech-bubble tail. Drawn open (no Z) so the stroke only covers the
           two slanted sides; the wide top edge gets hidden by the 1px overlap
           with the bubble, giving us a clean borderless seam. -->
      <svg
        class="minimap__tail"
        viewBox="0 0 16 10"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M 0 0 L 8 10 L 16 0"
          class="minimap__tail-fill"
        />
        <path
          d="M 0 0 L 8 10 L 16 0"
          class="minimap__tail-stroke"
        />
      </svg>
    </div>
  </Transition>
</template>

<style scoped>
.minimap {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(calc(-50% + var(--popover-nudge, 0px)));
  z-index: 20;
  pointer-events: none;
}

.minimap__tail {
  position: absolute;
  top: 100%;
  left: 50%;
  /* Overlap the bubble's bottom border by 1px so the tail hides the segment
     of border behind it without leaving a seam. */
  margin-top: -1px;
  width: 16px;
  height: 10px;
  transform: translateX(calc(-50% + var(--popover-tail-nudge, 0px)));
  overflow: visible;
}

.minimap__bubble {
  position: relative;
  width: clamp(160px, 18vw, 220px);
  max-width: calc(100vw - 24px);
  box-sizing: border-box;
  aspect-ratio: 2 / 1;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(6px);
  border: 1px solid rgb(var(--phosphor-rgb) / 0.5);
  border-radius: 12px;
  overflow: hidden;
}

.minimap__svg {
  width: 100%;
  height: 100%;
  display: block;
}

.minimap__land {
  /* Fill-only avoids edge artifacts at lat=±90 / antimeridian. evenodd is
     direction-agnostic for nested polygons. */
  fill: rgb(var(--phosphor-rgb) / 0.22);
  stroke: none;
}

.minimap__crosshair line {
  stroke: rgb(var(--phosphor-rgb) / 0.28);
  stroke-width: 0.6;
  stroke-dasharray: 2 3;
  vector-effect: non-scaling-stroke;
}

.minimap__dot {
  fill: var(--stumble-accent);
}

.minimap__pulse {
  fill: rgb(var(--phosphor-rgb) / 0.5);
  animation: minimap-pulse 1.8s ease-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}

.minimap__pulse--delayed {
  animation-delay: 0.9s;
}

@keyframes minimap-pulse {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(5);
    opacity: 0;
  }
}

.minimap__tail-fill {
  fill: rgba(0, 0, 0, 0.82);
}

.minimap__tail-stroke {
  fill: none;
  stroke: rgb(var(--phosphor-rgb) / 0.5);
  stroke-width: 1.2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.minimap-pop-enter-active,
.minimap-pop-leave-active {
  transition: opacity 200ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.minimap-pop-enter-from,
.minimap-pop-leave-to {
  opacity: 0;
  transform: translateX(calc(-50% + var(--popover-nudge, 0px))) scale(0.92) translateY(6px);
}
</style>
