<script setup lang="ts">
// eslint-disable-next-line vue/multi-word-component-names
defineOptions({ name: 'Screensaver' })

interface Props {
  src: string | null
  showStatic?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showStatic: false
})

const emit = defineEmits<{
  (e: 'exit'): void
}>()

const appConfig = useAppConfig()
const controlsHideMs = appConfig.timing?.ui?.screensaverControlsHideMs ?? 2500

const controlsVisible = ref(true)
let idleTimer: ReturnType<typeof setTimeout> | null = null
let requestedFullscreen = false

function revealControls() {
  controlsVisible.value = true
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    controlsVisible.value = false
  }, controlsHideMs)
}

function onActivity() {
  revealControls()
}

function exit() {
  emit('exit')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    exit()
  }
}

async function enterFullscreen() {
  const el = document.documentElement
  if (document.fullscreenElement || !el.requestFullscreen) return
  try {
    await el.requestFullscreen()
    requestedFullscreen = true
  } catch {
    // Fullscreen can be blocked (no gesture / permissions). The fixed overlay
    // still covers the viewport, so screensaver mode works regardless.
  }
}

function onFullscreenChange() {
  // User left fullscreen via Esc/F11 — treat that as quitting the screensaver.
  if (requestedFullscreen && !document.fullscreenElement) {
    requestedFullscreen = false
    exit()
  }
}

onMounted(() => {
  enterFullscreen()
  revealControls()
  window.addEventListener('mousemove', onActivity)
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onBeforeUnmount(() => {
  if (idleTimer) clearTimeout(idleTimer)
  window.removeEventListener('mousemove', onActivity)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (requestedFullscreen && document.fullscreenElement && document.exitFullscreen) {
    requestedFullscreen = false
    document.exitFullscreen().catch(() => {})
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      class="screensaver"
      :class="{ 'screensaver--idle': !controlsVisible }"
    >
      <img
        v-show="props.src"
        :src="props.src || ''"
        alt="Live webcam screensaver"
        class="screensaver__img"
        referrerpolicy="no-referrer"
        decoding="async"
      >
      <div
        v-show="!props.src"
        class="screensaver__placeholder"
      >
        <span>NO SIGNAL</span>
      </div>

      <StaticOverlay :visible="props.showStatic" />

      <Transition name="ss-fade">
        <button
          v-show="controlsVisible"
          type="button"
          class="screensaver__quit"
          title="Exit screensaver (Esc)"
          @click="exit"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.screensaver {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #000;
  overflow: hidden;
}

.screensaver--idle {
  cursor: none;
}

.screensaver__img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.screensaver__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--phosphor-bright);
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: clamp(18px, 3vw, 36px);
  letter-spacing: 0.5em;
  text-indent: 0.5em;
}

.screensaver__quit {
  position: absolute;
  top: clamp(14px, 2.4vw, 28px);
  right: clamp(14px, 2.4vw, 28px);
  z-index: 2;
  width: clamp(40px, 4vw, 52px);
  height: clamp(40px, 4vw, 52px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  color: #fff;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
}

.screensaver__quit:hover,
.screensaver__quit:focus-visible {
  border-color: var(--phosphor);
  background: rgba(0, 0, 0, 0.65);
  outline: none;
}

.screensaver__quit:active {
  transform: scale(0.94);
}

.screensaver__quit svg {
  width: 55%;
  height: 55%;
}

.ss-fade-enter-active,
.ss-fade-leave-active {
  transition: opacity 200ms ease;
}
.ss-fade-enter-from,
.ss-fade-leave-to {
  opacity: 0;
}
</style>
