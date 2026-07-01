<script setup lang="ts">
import { EXPLORE_SOURCE_CACHED, EXPLORE_SOURCE_LIVE } from '#shared/explore'

defineOptions({ name: 'MapPage' })

// Route component → owns orchestration. The canvas stays presentational and all
// fetch/LOD logic lives in the composable; the single-cam dialog is reused
// verbatim from the explore layer (same ?cam= route contract).
const { initialView, markers, total, truncated, loading, source, setSource, onViewChange } = useMapExplorer()
const dialog = await useExploreCamDialog()

const countLabel = computed(() => `${total.value.toLocaleString()}${truncated.value ? '+' : ''}`)

useSeoMeta({
  title: () => (dialog.detail.value?.location ? `${dialog.detail.value.location} — IP Crawl Map` : 'Map — IP Crawl'),
  description: 'Explore the open-webcam catalog on a live world map with level-of-detail clustering.',
  ogTitle: 'IP Crawl — webcam atlas',
  ogDescription: 'Pan and zoom a world map of open camera feeds, clustered by location.'
})
</script>

<template>
  <div class="mapx">
    <MapCanvas
      class="mapx__canvas"
      :markers="markers"
      :initial-view="initialView"
      :cam-open="dialog.open.value"
      @viewchange="onViewChange"
      @select="id => dialog.openCam(id)"
    />

    <header class="mapx__header">
      <IpcrawlLogo />

      <div class="mapx__header-end">
        <p class="mapx__count">
          <UIcon
            v-if="loading"
            name="i-lucide-loader-circle"
            class="mapx__count-spin"
          />
          <span class="mapx__count-num">{{ countLabel }}</span>
          <span class="mapx__count-label"> in view</span>
        </p>

        <UButton
          icon="i-lucide-radio"
          :color="source === EXPLORE_SOURCE_LIVE ? 'primary' : 'neutral'"
          :variant="source === EXPLORE_SOURCE_LIVE ? 'solid' : 'subtle'"
          size="sm"
          :aria-pressed="source === EXPLORE_SOURCE_LIVE"
          :title="source === EXPLORE_SOURCE_LIVE ? 'Showing live cameras only' : 'Show live cameras only'"
          class="mapx__nav-btn"
          @click="setSource(source === EXPLORE_SOURCE_LIVE ? EXPLORE_SOURCE_CACHED : EXPLORE_SOURCE_LIVE)"
        >
          <span class="mapx__btn-label">Live only</span>
        </UButton>
        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="sm"
          title="Back to app"
          class="mapx__nav-btn"
        >
          <span class="mapx__btn-label">Back to grid</span>
        </UButton>
      </div>
    </header>

    <ExploreCamDialog
      :open="dialog.open.value"
      :detail="dialog.displayDetail.value"
      :loading="dialog.loading.value"
      @update:open="dialog.setOpen"
    />
  </div>
</template>

<style scoped>
/* Fullscreen atlas. The base app already pins the body to a fixed, non-scrolling
   surface, which suits a fill-the-viewport map; we just claim the whole frame. */
.mapx {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.mapx__canvas {
  position: absolute;
  inset: 0;
}

.mapx__header {
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
  /* Share the header morph with the catalogue/about/stats pages so the bar
     glides into place on route change instead of the catalogue header fading
     out while this floating pill crossfades in at a different spot. */
  view-transition-name: page-header;
}

/* The brand can give up width before the controls do, but never wraps. */
.mapx__header > :deep(.logo) {
  min-width: 0;
  overflow: hidden;
}

.mapx__header-end {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
}

/* Labels never wrap mid-phrase into a second line. */
.mapx__nav-btn {
  white-space: nowrap;
}

.mapx__count {
  margin: 0 4px 0 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-dim, #8b9591);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mapx__count-num {
  color: var(--phosphor);
  font-weight: 600;
}

.mapx__count-spin {
  width: 13px;
  height: 13px;
  color: var(--text-dim, #8b9591);
  animation: mapx-spin 0.8s linear infinite;
}

@keyframes mapx-spin {
  to { transform: rotate(360deg); }
}

/* Narrow viewports: collapse the controls to icons (the Nuxt UI label is a bare
   text node, not a `.truncate` span, so it must be hidden via our own wrapper)
   and drop the "in view" suffix, keeping just the count so the bar fits a phone
   width on one line. */
@media (max-width: 600px) {
  .mapx__btn-label,
  .mapx__count-label {
    display: none;
  }

  .mapx__count {
    margin-right: 2px;
  }
}

@media (max-width: 360px) {
  .mapx__count {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mapx__count-spin {
    animation: none;
  }
}
</style>
