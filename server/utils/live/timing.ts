// Tunable wall-clock knobs for the live snapshot pipeline. Every value can be
// overridden through `runtimeConfig.timingMs`; these defaults are what ship.
const LIVE_TIMING_DEFAULTS = {
  liveProbeTimeout: 2500,
  // Total wall-clock the probe sequence can spend on one cam. No platform
  // budget to worry about — just don't hang forever on a dead camera.
  liveProbeBudget: 30000,
  liveFetchTimeout: 5000,
  // Frames are cached this long so a swarm of polling viewers doesn't melt
  // the upstream camera.
  liveFrameCache: 800,
  // Grace window: keep serving the last good live frame for this long after a
  // transient fetch failure instead of snapping back to the Shodan still.
  liveFrameGrace: 10000,
  // After a failed probe, wait this long before trying again so we don't
  // re-probe a dead host on every page view.
  liveProbeRetry: 5 * 60 * 1000,
  // Check the durable write gate at most this often per cam.
  liveFramePersistLocal: 10 * 1000,
  // Best-effort write ceiling per cam.
  liveFramePersistGlobal: 45 * 1000
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
