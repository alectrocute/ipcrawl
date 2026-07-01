<script setup lang="ts">
import type { ExploreCamDetail } from '#shared/explore'
import { EXPLORE_FEED_BADGE_LABEL, type ExploreFeedBadgeTone } from '../../utils/feedBadge'

interface Props {
  open: boolean
  camId: string
  detail: ExploreCamDetail | null
  loading: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const openModel = computed({
  get: () => props.open,
  set: v => emit('update:open', v)
})

const { has: isFavorite, toggle: toggleFavorite, countOf } = useExploreFavorites()
const fav = computed(() => (props.detail ? isFavorite(props.detail.id) : false))
const favCount = computed(() => (props.detail ? countOf(props.detail.id, props.detail.favCount) : 0))

// --- Live feed poller -------------------------------------------------------
const { liveSrc, frameLoaded, frameErrored, isLiveFrame } = useLiveFramePoller(
  () => props.detail,
  () => props.open && !!props.detail && props.detail.id === props.camId
)

// Badge follows what's actually on screen: once a frame's provenance is known
// (X-Frame-Source) it wins, so a cam that's live-but-not-yet-probed flips to
// LIVE PROBE the moment a live frame lands instead of trusting the stale DB
// flag.
//
// A probe-capable cam warms up lazily: its first response is almost always the
// cached Shodan still — the live frame only lands once the probe wakes the
// camera (can take ~tens of seconds). Rather than flicker
// CONNECTING -> SNAPSHOT -> LIVE PROBE, hold CONNECTING (with a spinner) over
// whatever's painted until a live frame actually arrives. If none shows within
// the warm-up window, give up and settle on SNAPSHOT.
const PROBE_CONNECT_TIMEOUT_MS = 15_000
const connectTimedOut = ref(false)
let connectTimer: ReturnType<typeof setTimeout> | null = null

function clearConnectTimer() {
  if (connectTimer) clearTimeout(connectTimer)
  connectTimer = null
}

function armConnectTimer() {
  clearConnectTimer()
  connectTimedOut.value = false
  if (import.meta.client && props.detail?.liveProbeActive === true) {
    connectTimer = setTimeout(() => {
      connectTimedOut.value = true
    }, PROBE_CONNECT_TIMEOUT_MS)
  }
}

// (Re)start the countdown whenever the dialog opens or the cam changes; once a
// live frame proves the feed is live the spinner is moot, so drop the timer.
watch(
  () => [props.open && !!props.detail, props.detail?.id] as const,
  ([on]) => {
    if (on) armConnectTimer()
    else {
      clearConnectTimer()
      connectTimedOut.value = false
    }
  },
  { immediate: true }
)
watch(isLiveFrame, (live) => {
  if (live === true) clearConnectTimer()
})
onScopeDispose(clearConnectTimer)

const isConnecting = computed(() =>
  props.detail?.liveProbeActive === true
  && isLiveFrame.value !== true
  && !frameErrored.value
  && !connectTimedOut.value
)
const showLive = computed(() => !isConnecting.value && (isLiveFrame.value ?? props.detail?.isLive ?? false))
const badgeTone = computed<ExploreFeedBadgeTone>(() => isConnecting.value ? 'connecting' : showLive.value ? 'live' : 'cached')
const badgeLabel = computed(() =>
  isConnecting.value
    ? EXPLORE_FEED_BADGE_LABEL.connecting
    : showLive.value ? EXPLORE_FEED_BADGE_LABEL.liveProbe : EXPLORE_FEED_BADGE_LABEL.snapshot
)

// --- Crossfade --------------------------------------------------------------
// The poller swaps `liveSrc` to a fresh blob per frame; a single <img> would
// just replace its bitmap in place (no fade). We ping-pong two stacked layers
// instead: each new frame loads into the hidden layer and, once decoded, fades
// in over the previous one (which the poller has already painted on screen).
const layers = ref([{ src: '' }, { src: '' }])
const front = ref(0)

watch(liveSrc, (src) => {
  if (!src) {
    layers.value = [{ src: '' }, { src: '' }]
    return
  }
  layers.value[front.value ^ 1]!.src = src
})

function onLayerLoad(i: number) {
  // Flip only after the new frame has decoded, so the fade has something to
  // cross to rather than briefly showing a half-painted frame.
  front.value = i
  frameLoaded.value = true
  frameErrored.value = false
}

function onLayerError(i: number) {
  // Empty-src placeholder layers (before the first frame lands, and on every
  // reopen when `liveSrc` resets to '') fire a spurious error event in
  // Chromium — the empty URL resolves to the page URL. Only surface NO SIGNAL
  // for a layer that's actually pointing at a frame.
  if (layers.value[i]?.src) frameErrored.value = true
}

// --- Copy link --------------------------------------------------------------
// The open dialog is addressable: the current URL already carries ?cam=<id>
// plus the active filter context, so that's exactly what we share.
const { copied, copyCurrentPageUrl: copyLink } = useCopyPageUrl()

const title = computed(() => props.detail?.location || 'Unknown location')

function formatDate(ms: number | null): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return '—'
  }
}

function formatCoords(lat: number | null, lon: number | null): string {
  if (lat == null || lon == null) return '—'
  return `${lat.toFixed(3)}, ${lon.toFixed(3)}`
}

interface MetaRow { label: string, value: string }
const metaRows = computed<MetaRow[]>(() => {
  const d = props.detail
  if (!d) return []
  return [
    { label: 'Favorites', value: favCount.value.toLocaleString() },
    { label: 'Manufacturer', value: d.manufacturer || '—' },
    { label: 'ISP / Org', value: d.org || '—' },
    { label: 'Country', value: d.country || '—' },
    { label: 'City', value: d.city || '—' },
    { label: 'Coordinates', value: formatCoords(d.lat, d.lon) },
    { label: 'Protocol', value: d.module || '—' },
    { label: 'Port', value: d.port != null ? String(d.port) : '—' },
    { label: 'First seen', value: formatDate(d.firstSeenAt) },
    { label: 'Last seen', value: formatDate(d.lastSeenAt) }
  ]
})
</script>

<template>
  <UModal
    v-model:open="openModel"
    :title="title"
    :description="props.detail?.org || undefined"
    :ui="{ content: 'sm:max-w-6xl' }"
  >
    <template #body>
      <div
        v-if="props.loading"
        class="dialog__loading"
      >
        <USkeleton class="dialog__feed-skeleton" />
        <div class="dialog__meta-skeleton">
          <USkeleton
            v-for="n in 6"
            :key="n"
            class="dialog__meta-skeleton-row"
          />
        </div>
      </div>

      <div
        v-else-if="!props.detail"
        class="dialog__error"
      >
        <UIcon
          name="i-lucide-unplug"
          class="dialog__error-icon"
        />
        <p class="dialog__error-text">
          Couldn't load this camera. Close and try again.
        </p>
      </div>

      <div
        v-else
        class="dialog"
      >
        <div class="dialog__feed">
          <USkeleton
            v-if="!frameLoaded && !frameErrored"
            class="dialog__feed-skeleton"
          />
          <img
            v-for="(layer, i) in layers"
            v-show="layer.src"
            :key="i"
            :src="layer.src"
            :alt="`Feed from ${title}`"
            class="dialog__feed-img"
            :class="{ 'dialog__feed-img--ready': front === i && !frameErrored }"
            referrerpolicy="no-referrer"
            decoding="async"
            @load="onLayerLoad(i)"
            @error="onLayerError(i)"
          >
          <div
            v-if="frameErrored"
            class="dialog__feed-nosignal"
          >
            NO SIGNAL
          </div>
          <ExploreFeedBadge
            class="dialog__feed-badge"
            :tone="badgeTone"
            :label="badgeLabel"
            backdrop
          />

          <UPopover
            mode="hover"
            arrow
            class="dialog__feed-help"
          >
            <UButton
              icon="i-lucide-circle-help"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Viewing tips"
              class="dialog__help-btn"
            />
            <template #content>
              <div class="dialog__help">
                <p>
                  <strong>Live probes warm up.</strong> If you're the only
                  viewer, a feed can take up to ~30 seconds to go live while
                  the probe wakes the camera — the cached still shows until a
                  fresh frame lands.
                </p>
                <p>
                  <strong>Keyboard.</strong> <kbd>←</kbd> <kbd>→</kbd> flip
                  pages in the grid; with a camera open they step to the
                  previous / next camera, crossing pages as needed.
                </p>
              </div>
            </template>
          </UPopover>
        </div>

        <div class="dialog__side">
          <ExploreLocatorMap
            :lat="props.detail.lat"
            :lon="props.detail.lon"
          />

          <dl class="dialog__meta">
            <div
              v-for="row in metaRows"
              :key="row.label"
              class="dialog__meta-row"
            >
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>

          <div class="dialog__actions">
            <UButton
              :icon="fav ? 'i-lucide-heart-off' : 'i-lucide-heart'"
              :color="fav ? 'primary' : 'neutral'"
              variant="subtle"
              block
              :aria-pressed="fav"
              @click="toggleFavorite(props.detail.id, props.detail.favCount)"
            >
              {{ fav ? 'Remove Favorite' : 'Add Favorite' }}
            </UButton>
            <UButton
              :icon="copied ? 'i-lucide-check' : 'i-lucide-link'"
              color="neutral"
              variant="subtle"
              block
              @click="copyLink"
            >
              {{ copied ? 'Copied!' : 'Copy URL' }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.dialog {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) minmax(0, 1fr);
  gap: 18px;
}

.dialog__loading {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) minmax(0, 1fr);
  gap: 18px;
}

.dialog__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 56px 24px;
  color: var(--text-dim, #8b9591);
}

.dialog__error-icon {
  width: 26px;
  height: 26px;
  color: var(--text-mute, #58615d);
}

.dialog__error-text {
  margin: 0;
  font-size: 13px;
}

.dialog__feed {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.1));
}

.dialog__feed-skeleton {
  width: 100%;
  height: 100%;
}

/* Inside the real feed frame it overlays the (still-loading) img; in the
   loading grid it has no positioned parent, so it sizes itself instead. */
.dialog__feed .dialog__feed-skeleton {
  position: absolute;
  inset: 0;
}

.dialog__loading .dialog__feed-skeleton {
  height: auto;
  aspect-ratio: 4 / 3;
  border-radius: 12px;
}

.dialog__feed-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  transition: opacity 240ms ease;
}

.dialog__feed-img--ready {
  opacity: 1;
}

.dialog__feed-nosignal {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  letter-spacing: 0.34em;
  text-indent: 0.34em;
  color: var(--text-mute, #58615d);
}

.dialog__feed-badge {
  position: absolute;
  top: 10px;
  left: 10px;
}

/* Mirrors the badge: top-left explains what you're seeing, top-right how. */
.dialog__feed-help {
  position: absolute;
  top: 10px;
  right: 10px;
}

.dialog__help-btn {
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.12));
  backdrop-filter: blur(6px);
}

.dialog__help {
  max-width: 300px;
  padding: 14px 16px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-dim, #8b9591);
}

.dialog__help p {
  margin: 0;
}

.dialog__help p + p {
  margin-top: 10px;
}

.dialog__help strong {
  color: var(--text, #f4f6f5);
  font-weight: 700;
}

.dialog__help kbd {
  display: inline-block;
  min-width: 18px;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--hairline-strong, rgba(255, 255, 255, 0.16));
  background: rgba(255, 255, 255, 0.05);
  font-family: inherit;
  font-size: 11px;
  text-align: center;
  color: var(--text, #f4f6f5);
}

@keyframes dialog-connect-glow {
  0%, 100% { box-shadow: 0 0 12px rgb(var(--phosphor-rgb) / 0.16); }
  50% { box-shadow: 0 0 24px rgb(var(--phosphor-rgb) / 0.34); }
}

@keyframes dialog-connect-dot {
  0%, 100% { transform: scale(0.75); opacity: 0.45; }
  50% { transform: scale(1.15); opacity: 1; }
}

.dialog__side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog__meta {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.dialog__meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--hairline, rgba(255, 255, 255, 0.06));
  font-size: 12.5px;
}

.dialog__meta-row dt {
  color: var(--text-dim, #8b9591);
  white-space: nowrap;
}

.dialog__meta-row dd {
  margin: 0;
  text-align: right;
  color: var(--text, #f4f6f5);
  word-break: break-word;
}

.dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

.dialog__meta-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dialog__meta-skeleton-row {
  height: 16px;
  width: 100%;
  border-radius: 4px;
}

@media (max-width: 640px) {
  .dialog,
  .dialog__loading {
    grid-template-columns: 1fr;
  }
}
</style>
