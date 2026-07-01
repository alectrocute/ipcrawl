<script setup lang="ts">
interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId: number | null = null

function drawStatic() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = canvas
  const image = ctx.createImageData(width, height)
  const data = image.data

  for (let i = 0; i < data.length; i += 4) {
    const v = (Math.random() * 255) | 0
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

function loop() {
  drawStatic()
  rafId = requestAnimationFrame(loop)
}

function startLoop() {
  const canvas = canvasRef.value
  if (!canvas) return
  // Low-res buffer keeps things fast — it's scaled up by CSS.
  canvas.width = 160
  canvas.height = 90
  loop()
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      nextTick(startLoop)
    } else {
      stopLoop()
    }
  },
  { immediate: true }
)

onBeforeUnmount(stopLoop)
</script>

<template>
  <Transition name="static-fade">
    <div
      v-if="props.visible"
      class="static"
    >
      <canvas
        ref="canvasRef"
        class="static__canvas"
      />
      <div class="static__bar" />
    </div>
  </Transition>
</template>

<style scoped>
.static {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  overflow: hidden;
}

.static__canvas {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
  opacity: 0.85;
  filter: contrast(1.2);
}

.static__bar {
  position: absolute;
  left: 0;
  right: 0;
  height: 10%;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(255, 255, 255, 0.1) 40%,
    rgba(255, 255, 255, 0.25) 50%,
    rgba(255, 255, 255, 0.1) 60%,
    transparent 100%
  );
  animation: static-bar 1.1s linear infinite;
}

@keyframes static-bar {
  from { top: -10%; }
  to { top: 110%; }
}

.static-fade-enter-active,
.static-fade-leave-active {
  transition: opacity 120ms ease;
}
.static-fade-enter-from,
.static-fade-leave-to {
  opacity: 0;
}
</style>
