<script setup lang="ts">
import type { FunCamChannel } from '#shared/fun'
import { API_CAM, apiCamPath, apiRandomCamPath, funChannelPath } from '#shared/routes'

// Keep ONE component instance across every /fun/c/<id> change. Default page key
// is route.fullPath, which would remount on every Next click — wiping refs,
// re-running setup, and re-resolving useAsyncData with a stale payload (the
// SSR'd channel would always win). A constant key keeps the polling timer,
// preloader, and `current` ref alive across navigation.
definePageMeta({
  key: 'channel'
})

const route = useRoute()
const router = useRouter()
const appConfig = useAppConfig()
const minStaticMs = appConfig.timing?.ui?.channelSwitchStaticMinMs ?? 1000

const routeId = computed(() => {
  const v = route.params.id
  return (Array.isArray(v) ? v[0] : v) ?? ''
})

// SSR-fetch the cam matching the route id. Key is route-scoped so a remount
// (if it ever happens) can't reuse a stale payload from a different channel.
const initialId = routeId.value
const { data: initial } = await useAsyncData<FunCamChannel | null>(
  `cam-${initialId}`,
  () => $fetch<FunCamChannel>(apiCamPath(initialId)).catch(() => null)
)

// If the channel doesn't exist (stale share link, post-refresh churn), bounce
// to a random channel so the visitor still lands on _something_. Use
// useRequestFetch so the SSR sub-request carries the history cookie.
if (!initial.value) {
  const requestFetch = useRequestFetch()
  const random = await requestFetch<FunCamChannel>(API_CAM).catch(() => null)
  if (random) {
    await navigateTo(funChannelPath(random.id), { replace: true })
  } else {
    throw createError({
      statusCode: 503,
      statusMessage: 'Channels are warming up. Refresh in a moment.'
    })
  }
}

const current = ref<FunCamChannel | null>(initial.value ?? null)
const errorMsg = ref<string | null>(null)
const liveOnly = ref(false)
const game = useGuessGame()
const { copied: copiedPageUrl, copyCurrentPageUrl } = useCopyPageUrl()
const {
  visibleSrc,
  showStatic,
  loading,
  beginChannelSwitch,
  cancelChannelSwitch
} = useVisibleCamFrame(current)

function randomCamUrl(opts: { coords?: boolean } = {}) {
  return apiRandomCamPath({
    live: liveOnly.value,
    coords: opts.coords,
    exclude: current.value?.id
  })
}

// React to URL changes that didn't originate from the Next button — back/
// forward navigation, paste-into-tab, link clicks. Fetches the new cam's
// metadata and lets the existing `current` watcher handle the swap.
watch(routeId, async (newId) => {
  if (!newId || newId === current.value?.id) return
  showStatic.value = true
  try {
    const cam = await $fetch<FunCamChannel>(apiCamPath(newId))
    current.value = cam
  } catch {
    showStatic.value = false
    errorMsg.value = 'Channel not found.'
  }
})

// Share URL / social cards / canonical link for the current channel.
useChannelShareMeta(current)

// Keep the game's scoring target in sync with whatever channel is showing.
watch(current, cam => game.setTarget(cam), { immediate: true })

async function next() {
  if (!beginChannelSwitch()) return
  errorMsg.value = null

  // Minimum static duration so the transition always reads as a TV cut.
  const minStatic = new Promise(resolve => setTimeout(resolve, minStaticMs))

  try {
    const [picked] = await Promise.all([
      $fetch<FunCamChannel>(randomCamUrl()),
      minStatic
    ])
    // Update current first so the preload begins immediately, then sync the
    // URL so the channel is shareable. The routeId watcher will see that
    // current.id already matches and skip a redundant fetch.
    current.value = picked
    await router.push(funChannelPath(picked.id))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errorMsg.value = message.includes('503')
      ? 'Channels are warming up. Try again shortly.'
      : 'Signal lost. Try again.'
    cancelChannelSwitch()
  }
}

// --- Guess Mode ----------------------------------------------------------
// The server filters to channels with real coordinates (`coords=1`) so every
// round is scoreable in a single request.
async function loadCamWithCoords(): Promise<FunCamChannel | null> {
  const cam = await $fetch<FunCamChannel>(randomCamUrl({ coords: true })).catch(() => null)
  return cam && cam.lat != null && cam.lon != null ? cam : null
}

// Swap to a fresh mystery channel without revealing where it is, reusing the
// TV-static transition for the cut.
async function loadGuessChannel() {
  if (!beginChannelSwitch()) return
  errorMsg.value = null
  const minStatic = new Promise(resolve => setTimeout(resolve, minStaticMs))
  try {
    const [picked] = await Promise.all([loadCamWithCoords(), minStatic])
    if (!picked) throw new Error('no-coords')
    current.value = picked
    await router.push(funChannelPath(picked.id))
  } catch {
    errorMsg.value = 'Could not find a locatable channel. Try again.'
    cancelChannelSwitch()
  }
}

// The map dialog (GuessOverlay) is opened on demand via "Show Map" rather than
// auto-popping when Guess Mode turns on.
const showGuessMap = ref(false)

async function onToggleGuess() {
  if (game.active.value) {
    game.stop()
    showGuessMap.value = false
    return
  }
  game.start()
  await loadGuessChannel()
}

function onShowMap() {
  showGuessMap.value = true
}

// --- Screensaver ---------------------------------------------------------
// Fullscreen edge-to-edge view of the current feed. Exit via Esc or the
// quit button (revealed on mouse movement).
const screensaverActive = ref(false)

function onScreensaver() {
  screensaverActive.value = true
}

function onScreensaverExit() {
  screensaverActive.value = false
}

async function onGuessNextRound() {
  game.advance()
  // advance() flips to 'summary' on the final round (keep the dialog open to
  // show the score); otherwise close the map and load the next mystery channel
  // so the player studies the new feed before reopening via "Show Map".
  if (game.phase.value === 'guessing') {
    showGuessMap.value = false
    await loadGuessChannel()
  }
}

async function onGuessRestart() {
  game.restart()
  showGuessMap.value = false
  await loadGuessChannel()
}

// Closing the dialog just hides the map — Guess Mode stays on so the player can
// peek at the feed and reopen via "Show Map".
function onGuessExit() {
  showGuessMap.value = false
}

// "Exit Game" fully leaves Guess Mode and closes the dialog.
function onExitGame() {
  game.stop()
  showGuessMap.value = false
}
</script>

<template>
  <div class="stage">
    <div
      class="stage__backlight"
      aria-hidden="true"
    />
    <section class="stage__screen">
      <CrtMonitor
        class="stage__crt"
        :src="visibleSrc"
      >
        <template #overlay>
          <StaticOverlay :visible="showStatic" />
          <div
            v-if="errorMsg"
            class="stage__error"
          >
            {{ errorMsg }}
          </div>
        </template>
      </CrtMonitor>

      <div class="stage__mobile-feed">
        <img
          v-show="visibleSrc"
          :src="visibleSrc || ''"
          alt="Live webcam screenshot"
          class="stage__mobile-img"
          referrerpolicy="no-referrer"
          decoding="async"
        >
        <div
          v-show="!visibleSrc"
          class="stage__mobile-placeholder"
        >
          <span>NO SIGNAL</span>
        </div>
        <StaticOverlay :visible="showStatic" />
        <div
          v-if="errorMsg"
          class="stage__error"
        >
          {{ errorMsg }}
        </div>
      </div>
    </section>

    <section class="stage__controls">
      <StumbleControls
        :loading="loading"
        :location="game.active.value ? null : current?.location"
        :org="game.active.value ? null : current?.org"
        :lat="game.active.value ? null : current?.lat"
        :lon="game.active.value ? null : current?.lon"
        :live-probe-active="current?.liveProbeActive"
        :copied-channel-url="copiedPageUrl"
        :guess-active="game.active.value"
        :map-open="showGuessMap"
        :screensaver-active="screensaverActive"
        :live-only="liveOnly"
        @update:live-only="liveOnly = $event"
        @next="next"
        @copy-channel-url="copyCurrentPageUrl"
        @toggle-guess="onToggleGuess"
        @show-map="onShowMap"
        @screensaver="onScreensaver"
      />
    </section>

    <InfoBox :total="current?.total ?? null" />

    <Screensaver
      v-if="screensaverActive"
      :src="visibleSrc"
      :show-static="showStatic"
      @exit="onScreensaverExit"
    />

    <GuessOverlay
      v-if="game.active.value && showGuessMap"
      :loading="loading"
      @next-round="onGuessNextRound"
      @restart="onGuessRestart"
      @exit="onGuessExit"
      @exit-game="onExitGame"
    />
  </div>
</template>

<style scoped>
.stage {
  /* Controls get a fixed slot so the Next button can never be pushed off
     the bottom edge; the screen takes whatever's left via grid's 1fr. */
  --stage-controls-height: 132px;

  position: relative;
  width: 100vw;
  height: 100vh;
  /* svh accounts for mobile browser chrome (URL bar) on Safari/Chrome. */
  height: 100svh;
  display: grid;
  grid-template-rows: 1fr var(--stage-controls-height);
  overflow: hidden;
}

/* Bias lighting: a soft phosphor halo bloom behind the monitor, the way a
   real screen spills light onto the wall behind it. Sits below the screen. */
.stage__backlight {
  position: absolute;
  left: 50%;
  top: 44%;
  width: min(78vw, 1100px);
  height: min(70vh, 720px);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(closest-side, rgb(var(--phosphor-rgb) / 0.16), rgb(var(--phosphor-rgb) / 0.05) 55%, transparent 78%);
  filter: blur(40px);
  animation: backlight-breathe 9s ease-in-out infinite;
}

@keyframes backlight-breathe {
  0%, 100% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.04); }
}

.stage__screen {
  position: relative;
  z-index: 1;
  width: min(90vw, 1180px);
  margin: clamp(16px, 3vh, 40px) auto -6px auto;
  /* min-height: 0 is required so the 1fr track can actually shrink to fit
     short viewports — otherwise the screen's intrinsic content blows past
     the row size and pushes the controls offscreen. */
  min-height: 0;
  overflow: visible;
}

.stage__crt {
  display: block;
  width: 100%;
  height: 100%;
}

.stage__mobile-feed {
  position: relative;
  display: none;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

.stage__mobile-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.stage__mobile-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--phosphor-bright);
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: clamp(16px, 5vw, 24px);
  letter-spacing: 0.42em;
  text-indent: 0.42em;
}

.stage__controls {
  position: relative;
  z-index: 2;
  width: min(90vw, 1180px);
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stage__error {
  position: absolute;
  inset: auto 0 16% 0;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--phosphor-bright);
  pointer-events: none;
  z-index: 6;
}

@media (max-width: 640px) {
  .stage {
    --stage-controls-height: 112px;
  }

  .stage__backlight {
    display: none;
  }

  .stage__screen {
    width: 100vw;
    margin: 0;
    overflow: hidden;
    background: #000;
  }

  .stage__crt {
    display: none;
  }

  .stage__mobile-feed {
    display: block;
  }

  .stage__controls {
    width: 100vw;
  }
}
</style>
