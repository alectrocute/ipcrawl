<script setup lang="ts">
// A compact, non-interactive locator map for the cam dialog. Reuses the shared
// equirectangular world geometry so it lines up pixel-for-pixel with Fun's maps.
interface Props {
  lat: number | null
  lon: number | null
}
const props = defineProps<Props>()

const WORLD_W = 1000
const WORLD_H = 500
const FOCUS_ZOOM = 4

const worldPath = ref('')
onMounted(async () => {
  const mod = await import('#shared/worldPath')
  worldPath.value = mod.WORLD_PATH
})

const marker = computed(() => {
  if (props.lat == null || props.lon == null) return null
  return {
    x: ((props.lon + 180) * WORLD_W) / 360,
    y: ((90 - props.lat) * WORLD_H) / 180
  }
})

const view = computed(() => {
  if (!marker.value) return { x: 0, y: 0, w: WORLD_W, h: WORLD_H }
  const w = WORLD_W / FOCUS_ZOOM
  const h = WORLD_H / FOCUS_ZOOM
  return {
    x: Math.max(0, Math.min(WORLD_W - w, marker.value.x - w / 2)),
    y: Math.max(0, Math.min(WORLD_H - h, marker.value.y - h / 2)),
    w,
    h
  }
})

const viewBox = computed(() =>
  `${view.value.x.toFixed(2)} ${view.value.y.toFixed(2)} ${view.value.w.toFixed(2)} ${view.value.h.toFixed(2)}`
)
</script>

<template>
  <div class="locator">
    <svg
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid slice"
      class="locator__svg"
      aria-hidden="true"
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
        class="locator__land"
        fill-rule="evenodd"
      />
      <g
        v-if="marker"
        :transform="`translate(${marker.x}, ${marker.y})`"
      >
        <circle
          class="locator__pulse"
          r="2.4"
        />
        <circle
          class="locator__dot"
          r="1.6"
        />
      </g>
    </svg>
    <p
      v-if="!marker"
      class="locator__empty"
    >
      No coordinates
    </p>
  </div>
</template>

<style scoped>
.locator {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 1;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgb(var(--phosphor-rgb) / 0.28);
  background: #040a07;
}

.locator__svg {
  width: 100%;
  height: 100%;
  display: block;
}

.locator__land {
  fill: rgb(var(--phosphor-rgb) / 0.22);
  stroke: none;
}

.locator__dot {
  fill: var(--phosphor-bright);
}

.locator__pulse {
  fill: rgb(var(--phosphor-rgb) / 0.5);
  transform-box: fill-box;
  transform-origin: center;
  animation: locator-pulse 1.8s ease-out infinite;
}

@keyframes locator-pulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(4.5); opacity: 0; }
}

.locator__empty {
  position: absolute;
  inset: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-mute, #58615d);
}
</style>
