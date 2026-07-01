import type { FunCamChannel } from '#shared/fun'
import {
  FRAME_ETAG_HEADER,
  FRAME_IF_NONE_MATCH_HEADER,
  FRAME_SOURCE_HEADER,
  FRAME_SOURCE_LIVE,
  FRAME_SOURCE_SHODAN,
  SHODAN_BACKOFF_AFTER,
  SLOW_FRAME_POLL_MS
} from '#shared/liveFrame'

interface UseVisibleCamFrameOptions {
  pollIntervalMs?: number
}

export function useVisibleCamFrame(
  current: Ref<FunCamChannel | null>,
  options: UseVisibleCamFrameOptions = {}
) {
  const appConfig = useAppConfig()
  const pollIntervalMs = options.pollIntervalMs ?? appConfig.timing?.ui?.framePollIntervalMs ?? 1000
  const frameSwapSafetyMs = appConfig.timing?.ui?.frameSwapSafetyMs ?? 4000

  const visibleSrc = ref<string | null>(current.value?.image ?? null)
  const showStatic = ref(false)
  const loading = ref(false)

  const frameBucket = ref(0)
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pendingFetchController: AbortController | null = null
  let fetchSeq = 0
  let activeBlobUrl: string | null = null
  // ETag of the frame currently on screen. Sent as If-None-Match on the next
  // poll so an unchanged frame (the common case for non-live cams) costs a
  // 304 instead of re-downloading ~50KB of identical JPEG every interval.
  let lastEtag: string | null = null
  let switchSafetyTimer: ReturnType<typeof setTimeout> | null = null
  let shodanStreak = 0
  let lastPollAt = 0

  function bucket(now = Date.now()): number {
    return Math.floor(now / pollIntervalMs)
  }

  function buildFrameUrl(cam: FunCamChannel, bucketValue: number): string {
    return bucketValue === 0 ? cam.image : `${cam.image}?t=${bucketValue}`
  }

  function stopPolling() {
    if (!pollTimer) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  function poll() {
    if (showStatic.value || !current.value) return
    const cam = current.value
    // Back off once the feed has settled on the static still — see
    // SHODAN_BACKOFF_AFTER. The URL bucket stays interval-based so viewers
    // in the same window keep sharing one edge-cache entry.
    const interval = shodanStreak >= SHODAN_BACKOFF_AFTER
      ? SLOW_FRAME_POLL_MS
      : pollIntervalMs
    if (Date.now() - lastPollAt < interval) return
    const nextBucket = bucket()
    if (nextBucket === frameBucket.value) return
    frameBucket.value = nextBucket
    lastPollAt = Date.now()
    fetchAndSwap(buildFrameUrl(cam, nextBucket))
  }

  function startPolling() {
    stopPolling()
    if (!current.value) return
    // The server never live-probes these cams (non-HTTP module/port, or live
    // probing disabled globally), so the frame can only change on the daily
    // refresh — an interval here would re-request the same still forever.
    if (current.value.liveProbeActive === false) return
    // Don't burn requests while the tab is hidden; the visibilitychange
    // handler restarts polling when the viewer comes back.
    if (document.hidden) return
    pollTimer = setInterval(poll, pollIntervalMs)
  }

  function revokeBlobUrl(url: string | null) {
    if (!url || !url.startsWith('blob:')) return
    URL.revokeObjectURL(url)
  }

  async function fetchAndSwap(url: string, onSettle?: () => void) {
    if (import.meta.server) {
      onSettle?.()
      return
    }

    pendingFetchController?.abort()
    const controller = new AbortController()
    pendingFetchController = controller
    const seq = ++fetchSeq

    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      onSettle?.()
    }

    const isActiveRequest = () =>
      pendingFetchController === controller
      && !controller.signal.aborted
      && seq === fetchSeq

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        headers: lastEtag ? { [FRAME_IF_NONE_MATCH_HEADER]: lastEtag } : undefined
      })
      // Both 200s and 304s carry X-Frame-Source, so the streak also advances
      // when the still is unchanged (the typical non-live case).
      const frameSource = response.headers.get(FRAME_SOURCE_HEADER)
      if (frameSource === FRAME_SOURCE_LIVE) shodanStreak = 0
      else if (frameSource === FRAME_SOURCE_SHODAN) shodanStreak++
      // 304: the frame on screen is still current — keep it.
      if (response.status === 304) {
        settle()
        return
      }
      if (!response.ok) throw new Error(`Frame fetch failed: ${response.status}`)
      const etag = response.headers.get(FRAME_ETAG_HEADER)
      const blob = await response.blob()
      if (!isActiveRequest()) return

      const nextBlobUrl = URL.createObjectURL(blob)
      const previousBlobUrl = activeBlobUrl
      activeBlobUrl = nextBlobUrl
      visibleSrc.value = nextBlobUrl
      lastEtag = etag
      revokeBlobUrl(previousBlobUrl)
      settle()
    } catch {
      if (!isActiveRequest()) return
      settle()
    } finally {
      if (pendingFetchController === controller) {
        pendingFetchController = null
      }
    }
  }

  function beginChannelSwitch() {
    if (loading.value) return false
    loading.value = true
    showStatic.value = true
    return true
  }

  function cancelChannelSwitch() {
    loading.value = false
    showStatic.value = false
  }

  watch(current, (cam) => {
    if (!cam) return

    frameBucket.value = 0
    lastEtag = null
    shodanStreak = 0
    lastPollAt = 0

    if (import.meta.server) {
      visibleSrc.value = cam.image
      return
    }

    // Cancel the previous switch's safety timer: if channels change in quick
    // succession, a stale timer would otherwise fire mid-switch and drop the
    // static overlay / unlock the Next button while the new frame still loads.
    if (switchSafetyTimer) {
      clearTimeout(switchSafetyTimer)
      switchSafetyTimer = null
    }

    let settled = false
    const finalize = () => {
      if (settled) return
      settled = true
      showStatic.value = false
      loading.value = false
      startPolling()
    }

    const safety = setTimeout(finalize, frameSwapSafetyMs)
    switchSafetyTimer = safety
    fetchAndSwap(cam.image, () => {
      clearTimeout(safety)
      if (switchSafetyTimer === safety) switchSafetyTimer = null
      finalize()
    })
  })

  function handleVisibility() {
    if (document.hidden) stopPolling()
    else startPolling()
  }

  onMounted(() => {
    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)
  })

  onBeforeUnmount(() => {
    stopPolling()
    if (switchSafetyTimer) {
      clearTimeout(switchSafetyTimer)
      switchSafetyTimer = null
    }
    pendingFetchController?.abort()
    pendingFetchController = null
    revokeBlobUrl(activeBlobUrl)
    activeBlobUrl = null
    document.removeEventListener('visibilitychange', handleVisibility)
  })

  return {
    visibleSrc,
    showStatic,
    loading,
    beginChannelSwitch,
    cancelChannelSwitch
  }
}
