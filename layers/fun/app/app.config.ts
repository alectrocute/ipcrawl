export default defineAppConfig({
  timing: {
    ui: {
      // How long "Copied URL!" stays visible.
      copyUrlResetMs: 1500,
      // How long the live-probe capability popover remains visible.
      liveProbePopoverMs: 10000,
      // How long static stays up during channel change transitions.
      channelSwitchStaticMinMs: 500,
      // Live frame polling cadence (also the bucket size for the ?t= cache
      // key). Raise this to reduce edge traffic.
      framePollIntervalMs: 3000,
      frameSwapSafetyMs: 4000,
      // Keep the minimap visible long enough for the fly animation.
      minimapAutoHideMs: 3000,
      minimapFlyMs: 800,
      // How long the screensaver quit button lingers after mouse activity.
      screensaverControlsHideMs: 2500
    }
  }
})
