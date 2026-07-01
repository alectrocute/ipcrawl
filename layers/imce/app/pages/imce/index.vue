<script setup lang="ts">
defineOptions({ name: 'ImcePage' })

// Route component → owns orchestration. The geolocation state machine + both
// data feeds live in the composable; the Leaflet canvas and the single-cam
// dialog are reused verbatim from the map/explore layers (same ?cam= contract),
// so a visitor can tap a nearby pin to inspect "is this one mine?".
const {
  phase,
  errorMessage,
  userLocation,
  initialView,
  mapVisible,
  nearby,
  markers,
  mapLoading,
  onViewChange,
  locate
} = useImceScan()

const dialog = await useExploreCamDialog()

useSeoMeta({
  title: 'Is my camera exposed? — IP Crawl',
  description: 'Scan your location against a live catalogue of open webcams and find out if there are internet-exposed cameras near you — and how to secure them.',
  ogTitle: 'Is my camera exposed?',
  ogDescription: 'Find out if there are internet-exposed cameras near you, then learn how to lock them down.',
  twitterCard: 'summary_large_image',
  robots: 'index, follow'
})
</script>

<template>
  <div class="imce">
    <MapCanvas
      v-if="initialView"
      class="imce__canvas"
      :markers="markers"
      :initial-view="initialView"
      :user-location="userLocation"
      :cam-open="dialog.open"
      @viewchange="onViewChange"
      @select="id => dialog.openCam(id)"
    />

    <!-- The header only exists once the visitor is on the map. While the veil is
         up the page is deliberately header-less (a clean landing), so on entry
         the previous page's `page-header` has nothing to morph into and instead
         fades out gracefully (see main.css) rather than morphing then snapping
         behind the veil. When the map arrives it slides the bar in. -->
    <transition name="imce-header">
      <header
        v-if="mapVisible"
        class="imce__header"
      >
        <IpcrawlLogo />
        <div class="imce__header-end">
          <span
            v-if="mapLoading"
            class="imce__sync"
            aria-hidden="true"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="imce__sync-spin"
            />
          </span>
          <UButton
            to="/"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="sm"
            title="Back to catalogue"
            class="imce__nav-btn"
          >
            <span class="imce__btn-label">Back to grid</span>
          </UButton>
        </div>
      </header>
    </transition>

    <!-- Scanning pill: map is up, the radius scan is still resolving. -->
    <transition name="imce-fade">
      <div
        v-if="phase === 'scanning'"
        class="imce__scanning"
      >
        <UIcon
          name="i-lucide-radar"
          class="imce__scanning-icon"
        />
        Scanning your surroundings…
      </div>
    </transition>

    <!-- Result alert, anchored beside the map. -->
    <transition name="imce-rise">
      <div
        v-if="phase === 'result'"
        class="imce__panel"
      >
        <ImceResultPanel
          :nearby="nearby"
          @rescan="locate"
          @select="id => dialog.openCam(id)"
        />
      </div>
    </transition>

    <!-- Pre-map veil: loading / permission prompt / failure states. -->
    <transition name="imce-fade">
      <ImceIntroShell
        v-if="!mapVisible"
        title="Is my camera exposed?"
        :icon-pulse="phase === 'locating'"
      >
        <template v-if="phase === 'locating'">
          <p class="imce__intro-text">
            Allow location access to scan the catalogue for exposed cameras
            around you.
          </p>
          <p class="imce__intro-hint">
            <UIcon
              name="i-lucide-loader-circle"
              class="imce__intro-spin"
            />
            Waiting for your location…
          </p>
        </template>

        <template v-else-if="phase === 'denied'">
          <p class="imce__intro-text">
            Location is needed to check what's exposed nearby. It stays in
            your browser except to query cameras around your coordinates.
          </p>
          <p class="imce__intro-hint imce__intro-hint--warn">
            Location access was blocked. Re-enable it for this site in your
            browser's address bar, then try again.
          </p>
        </template>

        <template v-else-if="phase === 'error'">
          <p class="imce__intro-text">
            {{ errorMessage || 'Something went wrong while locating you.' }}
          </p>
        </template>

        <template v-else-if="phase === 'unsupported'">
          <p class="imce__intro-text">
            This browser can't share location, so the scan won't work. The
            full catalogue is still on the map.
          </p>
        </template>

        <template
          v-if="phase === 'denied'"
          #actions
        >
          <UButton
            icon="i-lucide-map-pin"
            color="neutral"
            variant="solid"
            class="imce__intro-btn"
            @click="locate"
          >
            Try again
          </UButton>
        </template>

        <template
          v-else-if="phase === 'error'"
          #actions
        >
          <UButton
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="solid"
            class="imce__intro-btn"
            @click="locate"
          >
            Try again
          </UButton>
        </template>

        <template
          v-else-if="phase === 'unsupported'"
          #actions
        >
          <UButton
            to="/map"
            icon="i-lucide-map"
            color="neutral"
            variant="solid"
            class="imce__intro-btn"
          >
            Open the map
          </UButton>
        </template>
      </ImceIntroShell>
    </transition>

    <ExploreCamDialog
      :open="dialog.open.value"
      :detail="dialog.displayDetail.value"
      :loading="dialog.loading.value"
      @update:open="dialog.setOpen"
    />
  </div>
</template>

<style scoped>
/* Fullscreen scan surface, matching the map page's claim on the viewport. */
.imce {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.imce__canvas {
  position: absolute;
  inset: 0;
}

.imce__header {
  position: absolute;
  top: clamp(10px, 1.6vw, 16px);
  left: clamp(10px, 2vw, 18px);
  right: clamp(10px, 2vw, 18px);
  z-index: 1001;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px clamp(10px, 1.4vw, 16px);
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  background: var(--glass-strong, rgba(7, 11, 10, 0.82));
  backdrop-filter: blur(10px);
  view-transition-name: page-header;
}

.imce__header > :deep(.logo) {
  min-width: 0;
  overflow: hidden;
}

.imce__header-end {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
}

.imce__nav-btn {
  white-space: nowrap;
}

.imce__sync-spin {
  width: 15px;
  height: 15px;
  color: var(--text-dim, #8b9591);
  animation: imce-spin 0.8s linear infinite;
}

@keyframes imce-spin {
  to { transform: rotate(360deg); }
}

/* --- Scanning pill -------------------------------------------------------- */
.imce__scanning {
  position: absolute;
  top: calc(clamp(10px, 1.6vw, 16px) + 64px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1001;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: 1px solid var(--imce-alert-soft, rgba(255, 138, 76, 0.55));
  border-radius: 999px;
  background: var(--glass-strong, rgba(7, 11, 10, 0.88));
  backdrop-filter: blur(10px);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--imce-alert-bright, #ffb088);
}

.imce__scanning-icon {
  width: 15px;
  height: 15px;
  animation: imce-spin 1.6s linear infinite;
}

/* --- Result panel -------------------------------------------------------- */
.imce__panel {
  position: absolute;
  z-index: 1001;
  top: calc(clamp(10px, 1.6vw, 16px) + 64px);
  left: clamp(10px, 2vw, 18px);
  width: min(520px, calc(100vw - 36px));
  max-height: calc(100dvh - clamp(10px, 1.6vw, 16px) - 64px - 24px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--hairline-strong, rgba(255, 255, 255, 0.18)) transparent;
}

.imce__panel::-webkit-scrollbar {
  width: 8px;
}

.imce__panel::-webkit-scrollbar-thumb {
  background: var(--hairline-strong, rgba(255, 255, 255, 0.18));
  border-radius: 4px;
}

/* --- Transitions --------------------------------------------------------- */
.imce-fade-enter-active,
.imce-fade-leave-active {
  transition: opacity 280ms ease;
}

.imce-fade-enter-from,
.imce-fade-leave-to {
  opacity: 0;
}

.imce-rise-enter-active {
  transition: opacity 320ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.imce-rise-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

/* Header glides down into place when the scan resolves and the map takes over
   (a same-route state flip, so this Vue transition — not the route's view
   transition — owns it). On the way out it lifts away just as softly. */
.imce-header-enter-active,
.imce-header-leave-active {
  transition: opacity 360ms ease, transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
}

.imce-header-enter-from,
.imce-header-leave-to {
  opacity: 0;
  transform: translateY(-14px);
}

@media (max-width: 640px) {
  /* Result becomes a bottom sheet so the map stays usable above it. */
  .imce__panel {
    top: auto;
    bottom: 0;
    left: 0;
    width: 100%;
    max-height: 68dvh;
    padding: 0 8px 8px;
  }

  .imce__scanning {
    font-size: 11px;
    padding: 7px 13px;
  }
}

.imce__btn-label {
  white-space: nowrap;
}

@media (max-width: 480px) {
  .imce__btn-label {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .imce__sync-spin,
  .imce__scanning-icon {
    animation: none;
  }

  .imce-rise-enter-active,
  .imce-fade-enter-active,
  .imce-fade-leave-active {
    transition: none;
  }
}
</style>
