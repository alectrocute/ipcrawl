// Tunable wall-clock knobs for the live snapshot pipeline. Every value can be
// overridden through `runtimeConfig.timingMs`; these defaults are what ship.
const LIVE_TIMING_DEFAULTS = {
  liveProbeTimeout: 1500,
  // Total wall-clock the probe sequence can spend on one cam. Make it large
  // enough to cover the full SNAPSHOT_PATHS list even when every batch times
  // out — a slow-but-alive camera otherwise gets cached as "dead" before its
  // real path is ever reached.
  liveProbeBudget: 15000,
  liveFetchTimeout: 3000,
  // Frames are cached this long so a swarm of polling viewers doesn't melt
  // the upstream camera.
  liveFrameCache: 1000,
  // Grace window: keep serving the last good live frame for this long after a
  // transient fetch failure instead of snapping back to the Shodan still.
  liveFrameGrace: 8000,
  // After a failed probe, wait this long before trying again so we don't
  // re-probe a dead host on every page view.
  liveProbeRetry: 10 * 60 * 1000,
  // Check the durable write gate at most this often per cam.
  liveFramePersistLocal: 15 * 1000,
  // Best-effort write ceiling per cam.
  liveFramePersistGlobal: 60 * 1000
} as const

export function getLiveTimingMs() {
  const timing = useRuntimeConfig().timingMs ?? {}
  return {
    liveProbeTimeout: timing.liveProbeTimeout ?? LIVE_TIMING_DEFAULTS.liveProbeTimeout,
    liveProbeBudget: timing.liveProbeBudget ?? LIVE_TIMING_DEFAULTS.liveProbeBudget,
    liveFetchTimeout: timing.liveFetchTimeout ?? LIVE_TIMING_DEFAULTS.liveFetchTimeout,
    liveFrameCache: timing.liveFrameCache ?? LIVE_TIMING_DEFAULTS.liveFrameCache,
    liveFrameGrace: timing.liveFrameGrace ?? LIVE_TIMING_DEFAULTS.liveFrameGrace,
    liveProbeRetry: timing.liveProbeRetry ?? LIVE_TIMING_DEFAULTS.liveProbeRetry,
    liveFramePersistLocal: timing.liveFramePersistLocal ?? LIVE_TIMING_DEFAULTS.liveFramePersistLocal,
    liveFramePersistGlobal: timing.liveFramePersistGlobal ?? LIVE_TIMING_DEFAULTS.liveFramePersistGlobal
  }
}
