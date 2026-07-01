import type { ExploreCamDetail } from '#shared/explore'
import {
  EXPLORE_FRAME_POLL_MS,
  FRAME_ETAG_HEADER,
  FRAME_IF_NONE_MATCH_HEADER,
  FRAME_SOURCE_HEADER,
  FRAME_SOURCE_LIVE,
  FRAME_SOURCE_SHODAN,
  SHODAN_BACKOFF_AFTER,
  SLOW_FRAME_POLL_MS
} from '#shared/liveFrame'

// Bucket the `?t=` cache key to the poll interval so every viewer of the
// same cam in a window shares one URL (and therefore one edge-cache entry).
const POLL_MS = EXPLORE_FRAME_POLL_MS

// How long the previous frame's blob URL must outlive its swap so the
// consumer's crossfade can finish drawing it. Comfortably above the 240ms
// opacity transition the explore feeds use.
const REVOKE_DELAY_MS = 1000

/**
 * Polls a cam's live feed (the stricter `/api/live/[id]` probe route, vs the
 * grid's cheap cached thumbnails) while `active` is true.
 *
 * Frames are fetched manually (same pattern as the fun layer's
 * `useVisibleCamFrame`) rather than by rewriting `<img src>`: the img keeps
 * showing the current frame while the next one downloads, and an ETag /
 * If-None-Match round trip means an unchanged frame — the common case for
 * non-live cams serving the cached Shodan still — costs a 304 and never
 * touches the DOM. No black flash between polls.
 *
 * `frameLoaded` is owned by the caller's `<img>` load handler; this composable
 * resets it whenever the target cam changes and owns `frameErrored` (a fetch
 * failure with nothing on screen).
 *
 * `isLiveFrame` reports the provenance of the frame currently on screen from
 * the response's `X-Frame-Source` header (`true` = freshly fetched live frame,
 * `false` = cached Shodan still, `null` = not yet known). Lets a consumer badge
 * reflect what's actually displaying instead of the cam's stale DB probe flag.
 */
export function useLiveFramePoller(
  detail: () => ExploreCamDetail | null,
  active: () => boolean
) {
  const liveSrc = ref('')
  const frameLoaded = ref(false)
  const frameErrored = ref(false)
  const isLiveFrame = ref<boolean | null>(null)

  let timer: ReturnType<typeof setInterval> | null = null
  let controller: AbortController | null = null
  let fetchSeq = 0
  let lastBucket = -1
  let lastEtag: string | null = null
  let activeBlobUrl: string | null = null
  let shodanStreak = 0
  let lastFetchAt = 0
  const pendingRevokes = new Map<string, ReturnType<typeof setTimeout>>()

  function revokeBlobUrl(url: string | null) {
    if (!url || !url.startsWith('blob:')) return
    URL.revokeObjectURL(url)
  }

  // Revoke after a grace period so a frame fading out isn't pulled mid-decode.
  function scheduleRevoke(url: string | null) {
    if (!url || !url.startsWith('blob:')) return
    pendingRevokes.set(url, setTimeout(() => {
      pendingRevokes.delete(url)
      revokeBlobUrl(url)
    }, REVOKE_DELAY_MS))
  }

  // Cancel timers and revoke now — used when tearing down, where there's no
  // crossfade left to protect and lingering blob URLs would just leak.
  function flushRevokes() {
    for (const [url, timer] of pendingRevokes) {
      clearTimeout(timer)
      revokeBlobUrl(url)
    }
    pendingRevokes.clear()
  }

  async function fetchFrame(url: string) {
    controller?.abort()
    const ctrl = new AbortController()
    controller = ctrl
    const seq = ++fetchSeq
    const isCurrent = () => !ctrl.signal.aborted && seq === fetchSeq

    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        cache: 'no-store',
        headers: lastEtag ? { [FRAME_IF_NONE_MATCH_HEADER]: lastEtag } : undefined
      })
      // Both 200s and 304s carry X-Frame-Source, so the streak also advances
      // when the still is unchanged (the typical non-live case).
      const frameSource = res.headers.get(FRAME_SOURCE_HEADER)
      if (frameSource === FRAME_SOURCE_LIVE) shodanStreak = 0
      else if (frameSource === FRAME_SOURCE_SHODAN) shodanStreak++
      // Surface the frame's provenance for the consumer's badge. Valid on both
      // a 200 (new frame) and a 304 (the unchanged frame still has this source).
      if (isCurrent() && (frameSource === FRAME_SOURCE_LIVE || frameSource === FRAME_SOURCE_SHODAN)) {
        isLiveFrame.value = frameSource === FRAME_SOURCE_LIVE
      }
      // 304: the frame on screen is still current — keep it.
      if (res.status === 304) return
      if (!res.ok) throw new Error(`Frame fetch failed: ${res.status}`)
      const etag = res.headers.get(FRAME_ETAG_HEADER)
      const blob = await res.blob()
      if (!isCurrent()) return

      lastEtag = etag
      const previous = activeBlobUrl
      activeBlobUrl = URL.createObjectURL(blob)
      liveSrc.value = activeBlobUrl
      frameErrored.value = false
      // Defer revocation past the consumer's crossfade: the previous blob is
      // still the URL of the frame fading out, and revoking it mid-decode (if
      // the next frame arrives before this one paints) would blank that layer.
      scheduleRevoke(previous)
    } catch {
      if (!isCurrent()) return
      // Only surface NO SIGNAL when there's nothing on screen; a transient
      // poll failure over a visible frame just keeps the last frame.
      if (!liveSrc.value) frameErrored.value = true
    } finally {
      if (controller === ctrl) controller = null
    }
  }

  function poll() {
    const d = detail()
    if (!d) return
    // Back off once the feed has settled on the static still. The URL bucket
    // stays POLL_MS-based so viewers in the same window keep sharing one
    // edge-cache entry regardless of their local cadence.
    const interval = shodanStreak >= SHODAN_BACKOFF_AFTER ? SLOW_FRAME_POLL_MS : POLL_MS
    if (Date.now() - lastFetchAt < interval) return
    const bucket = Math.floor(Date.now() / POLL_MS)
    if (bucket === lastBucket) return
    lastBucket = bucket
    lastFetchAt = Date.now()
    fetchFrame(`${d.live}?t=${bucket}`)
  }

  function stopPolling() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  function startPolling() {
    stopPolling()
    if (!import.meta.client) return
    timer = setInterval(poll, POLL_MS)
  }

  function reset() {
    controller?.abort()
    controller = null
    fetchSeq++
    lastBucket = -1
    lastEtag = null
    shodanStreak = 0
    lastFetchAt = 0
    frameLoaded.value = false
    frameErrored.value = false
    isLiveFrame.value = null
    liveSrc.value = ''
    revokeBlobUrl(activeBlobUrl)
    activeBlobUrl = null
    flushRevokes()
  }

  function begin() {
    reset()
    const d = detail()
    if (!d || !import.meta.client) return
    fetchFrame(d.live)
    startPolling()
  }

  // `immediate` covers deep links (?cam=... on first paint): `active` is
  // already true when this watcher registers, so without it the poller would
  // never start. `begin()` no-ops on the server, and on the client the watcher
  // runs during hydration setup, which is exactly when we want the first fetch.
  watch(active, (on) => {
    if (on) begin()
    else {
      stopPolling()
      reset()
    }
  }, { immediate: true })
  // Cam changed while the dialog stays open: start over for the new feed.
  watch(() => detail()?.id, (id) => {
    if (id && active()) begin()
  })

  onScopeDispose(() => {
    stopPolling()
    reset()
  })

  return { liveSrc, frameLoaded, frameErrored, isLiveFrame }
}
