<script setup lang="ts">
interface Props {
  loading?: boolean
  location?: string | null
  org?: string | null
  liveProbeActive?: boolean
  copiedChannelUrl?: boolean
  lat?: number | null
  lon?: number | null
  guessActive?: boolean
  mapOpen?: boolean
  screensaverActive?: boolean
  liveOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  location: null,
  org: null,
  liveProbeActive: false,
  copiedChannelUrl: false,
  lat: null,
  lon: null,
  guessActive: false,
  mapOpen: false,
  screensaverActive: false,
  liveOnly: false
})

const showMainExtras = computed(
  () => !props.guessActive && !props.screensaverActive
)

const emit = defineEmits<{
  (e: 'next' | 'copyChannelUrl' | 'toggleGuess' | 'showMap' | 'screensaver'): void
  (e: 'update:liveOnly', value: boolean): void
}>()
const appConfig = useAppConfig()
const minimapAutoHideMs = appConfig.timing?.ui?.minimapAutoHideMs ?? 1800

const mapHovered = ref(false)
const mapAutoVisible = ref(false)
const liveHovered = ref(false)
const extrasMenuOpen = ref(false)
let mapAutoHideTimer: ReturnType<typeof setTimeout> | null = null

const liveOnlyModel = computed({
  get: () => props.liveOnly,
  set: (value: boolean) => emit('update:liveOnly', value)
})

const mapVisible = computed(
  () => !extrasMenuOpen.value
    && !liveHovered.value
    && (mapHovered.value || mapAutoVisible.value)
)

const livePopoverVisible = computed(
  () => !extrasMenuOpen.value
    && !mapHovered.value
    && !mapAutoVisible.value
    && liveHovered.value
)

function clearMapAutoHideTimer() {
  if (!mapAutoHideTimer) return
  clearTimeout(mapAutoHideTimer)
  mapAutoHideTimer = null
}

function onMapHover(hovering: boolean) {
  mapHovered.value = hovering
  if (hovering) liveHovered.value = false
}

function onLiveHover(hovering: boolean) {
  liveHovered.value = hovering
  if (hovering) {
    mapHovered.value = false
    mapAutoVisible.value = false
    clearMapAutoHideTimer()
  }
}

watch(extrasMenuOpen, (isOpen) => {
  if (!isOpen) return
  mapHovered.value = false
  mapAutoVisible.value = false
  liveHovered.value = false
  clearMapAutoHideTimer()
})

watch(
  [() => props.lat, () => props.lon],
  ([lat, lon], [prevLat, prevLon]) => {
    if (lat == null || lon == null) return
    if (lat === prevLat && lon === prevLon) return

    clearMapAutoHideTimer()
    mapAutoVisible.value = true
    // Keep map open through the fly animation so the location transition is visible.
    mapAutoHideTimer = setTimeout(() => {
      mapAutoVisible.value = false
      mapAutoHideTimer = null
    }, minimapAutoHideMs)
  },
  { immediate: true }
)

function onKey(e: KeyboardEvent) {
  // Don't hijack Space/Enter when a control is focused — otherwise activating
  // a button via keyboard would also fire the global shortcut.
  const target = e.target as HTMLElement | null
  if (target?.closest('button, a, input, textarea, select, [contenteditable="true"]')) return

  if (props.guessActive) {
    // In Guess Mode, Enter/Space opens the map dialog. Once it's open the
    // overlay owns the keyboard (Enter submits / advances rounds).
    if (!props.mapOpen && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault()
      emit('showMap')
    }
    return
  }

  if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
    e.preventDefault()
    emit('next')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearMapAutoHideTimer()
})
</script>

<template>
  <div class="controls">
    <div class="controls__deck">
      <!-- The map + location readout are hidden during Guess Mode so the
           answer isn't given away before the player commits. -->
      <div
        v-if="!props.guessActive"
        class="controls__cluster"
      >
        <div class="controls__anchor">
          <Minimap
            :lat="props.lat"
            :lon="props.lon"
            :visible="mapVisible"
          />
          <ControlsMapTriggerButton @hover="onMapHover" />
        </div>
        <div
          class="controls__anchor"
          @mouseenter="onLiveHover(true)"
          @mouseleave="onLiveHover(false)"
        >
          <ControlsLiveProbePopover
            :visible="livePopoverVisible"
            :active="props.liveProbeActive"
          />
          <ControlsLiveIndicator
            :active="props.liveProbeActive"
            @hover="onLiveHover"
          />
        </div>
      </div>
      <ControlsLiveIndicator
        v-else
        :active="props.liveProbeActive"
      />
      <ControlsExtrasMenu
        v-if="showMainExtras"
        v-model:open="extrasMenuOpen"
      >
        <ControlsExtrasMenuItem
          :label="props.copiedChannelUrl ? 'Copied!' : 'Copy URL'"
          keep-open
          :class="{ 'extras-menu-item--copied': props.copiedChannelUrl }"
          @select="emit('copyChannelUrl')"
        >
          <template #icon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect
                x="9"
                y="9"
                width="13"
                height="13"
                rx="2"
              />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </template>
        </ControlsExtrasMenuItem>
        <ControlsExtrasMenuToggle
          v-model="liveOnlyModel"
          label="Live Only"
        >
          <template #icon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle
                cx="12"
                cy="12"
                r="3.2"
              />
              <path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
            </svg>
          </template>
        </ControlsExtrasMenuToggle>
        <ControlsExtrasMenuItem
          label="Guess Game"
          @select="emit('toggleGuess')"
        >
          <template #icon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z" />
              <circle
                cx="12"
                cy="10"
                r="2.4"
              />
            </svg>
          </template>
        </ControlsExtrasMenuItem>
        <ControlsExtrasMenuItem
          label="Screensaver"
          @select="emit('screensaver')"
        >
          <template #icon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect
                x="3"
                y="4"
                width="18"
                height="13"
                rx="1.6"
              />
              <path d="M8 20h8" />
              <path d="M12 17v3" />
              <path d="M10.5 8.5l4 2.5-4 2.5z" />
            </svg>
          </template>
        </ControlsExtrasMenuItem>
      </ControlsExtrasMenu>
      <template v-if="!props.guessActive">
        <span
          class="controls__sep"
          aria-hidden="true"
        />
        <span
          class="controls__meta"
          :title="props.org ? `${props.location || 'Unknown location'} · ${props.org}` : (props.location || 'Unknown location')"
        >
          <span class="controls__value">{{ props.location || 'UNKNOWN LOCATION' }}</span>
          <span
            v-if="props.org"
            class="controls__org"
          >&nbsp;· {{ props.org }}</span>
        </span>
      </template>
      <span
        v-else
        class="controls__meta controls__meta--guess"
      >SIGNAL ANONYMIZED &mdash; WHERE IS THIS?</span>
    </div>

    <div class="controls__actions">
      <ControlsShowMapButton
        v-if="props.guessActive"
        @show="emit('showMap')"
      />
      <ControlsNextChannelButton
        v-if="!props.guessActive"
        :loading="props.loading"
        @next="emit('next')"
      />
    </div>
  </div>
</template>

<style scoped>
.controls {
  width: 100%;
  height: 100%;
  display: flex;
  position: relative;
  /* Top-align so the deck + NEXT hug the monitor, leaving the bottom strip
     of the controls band clear for the centered STUMBLETV wordmark. */
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: clamp(10px, 2.6vh, 20px) clamp(12px, 2vw, 32px) 0;
}

/* A single glass surface that houses the location intelligence: map toggle,
   channel id chip, and the place + ISP readout. */
.controls__deck {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.7em;
  padding: 0.5em 0.85em;
  border-radius: 999px;
  background: var(--glass);
  backdrop-filter: blur(14px) saturate(1.2);
  font-family: var(--font-mono);
  font-size: clamp(11px, 1.1vw, 14px);
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  white-space: nowrap;
}

/* Map + live triggers sit inline; their popovers are absolutely positioned
   above each anchor so they never affect deck height. */
.controls__cluster {
  display: inline-flex;
  align-items: center;
  gap: 0.55em;
}

.controls__anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

/* Bridge the gap between the live indicator and its popover so hover stays
   active while the cursor crosses the tail. */
.controls__anchor:has(.live-popover)::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  height: 14px;
}

/* Right-side action group. */
.controls__actions {
  display: flex;
  align-items: stretch;
  gap: 10px;
  flex: 0 0 auto;
}

.controls__sep {
  width: 1px;
  height: 1.4em;
  background: var(--hairline-strong);
  flex: 0 0 auto;
}

.controls__meta--guess {
  color: var(--phosphor);
  letter-spacing: 0.16em;
}

/* Single-line readout: the full "location · ISP" string truncates with one
   ellipsis only when it actually overflows the cap. */
.controls__meta {
  display: block;
  min-width: 0;
  max-width: clamp(140px, 40vw, 600px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.controls__value {
  color: var(--text);
}

/* On tiny screens drop the verbose readout and the separator; the map + id
   chip remain as a compact pill. */
@media (max-width: 576px) {
  .controls__sep,
  .controls__meta {
    display: none;
  }
}

.controls__org {
  color: var(--text-dim);
}
</style>
