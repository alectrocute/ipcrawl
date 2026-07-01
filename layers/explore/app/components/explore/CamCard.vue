<script setup lang="ts">
import type { ExploreCamCard } from '#shared/explore'
import { EXPLORE_FEED_BADGE_LABEL } from '../../utils/feedBadge'

interface Props {
  card: ExploreCamCard
}
const props = defineProps<Props>()
const emit = defineEmits<{ select: [card: ExploreCamCard] }>()

// Only request the thumbnail once the card scrolls into view. The thumb route
// is cheap + heavily cached, but deferring off-screen cards still trims the
// initial burst on a long, fast-scrolled grid.
const root = ref<HTMLElement | null>(null)
const inView = ref(false)
const loaded = ref(false)
const errored = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    inView.value = true
    return
  }
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        inView.value = true
        observer?.disconnect()
        observer = null
        break
      }
    }
  }, { rootMargin: '300px' })
  if (root.value) observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const label = computed(() => props.card.location || 'Unknown location')

const { has: isFavorite, toggle: toggleFavorite, countOf } = useExploreFavorites()
const fav = computed(() => isFavorite(props.card.id))
const favCount = computed(() => countOf(props.card.id, props.card.favCount))
</script>

<template>
  <!-- The open-action is an invisible full-card overlay button rather than a
       button root, so the favorite toggle isn't a (invalid) nested button. -->
  <article
    ref="root"
    class="cam-card"
  >
    <button
      type="button"
      class="cam-card__hit"
      :aria-label="`Open ${label}`"
      @click="emit('select', props.card)"
    />

    <button
      type="button"
      class="cam-card__fav"
      :class="{ 'cam-card__fav--active': fav }"
      :aria-pressed="fav"
      :aria-label="fav ? `Remove ${label} from favorites` : `Add ${label} to favorites`"
      @click="toggleFavorite(props.card.id, props.card.favCount)"
    >
      <UIcon
        name="i-lucide-heart"
        class="cam-card__fav-icon"
      />
    </button>

    <span class="cam-card__frame">
      <USkeleton
        v-if="!loaded && !errored"
        class="cam-card__skeleton"
      />
      <img
        v-if="inView && !errored"
        :src="props.card.thumb"
        :alt="label"
        class="cam-card__img"
        :class="{ 'cam-card__img--ready': loaded }"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        @load="loaded = true"
        @error="errored = true"
      >
      <span
        v-if="errored"
        class="cam-card__nosignal"
      >NO SIGNAL</span>

      <ExploreFeedBadge
        class="cam-card__badge"
        :tone="props.card.isLive ? 'live' : 'cached'"
        :label="props.card.isLive ? EXPLORE_FEED_BADGE_LABEL.live : EXPLORE_FEED_BADGE_LABEL.snapshot"
        size="sm"
      />
    </span>

    <span class="cam-card__meta">
      <span class="cam-card__location">{{ label }}</span>
      <span class="cam-card__sub">
        <span class="cam-card__org">{{ props.card.org || '—' }}</span>
        <span
          v-if="favCount > 0"
          class="cam-card__favcount"
          :title="`${favCount} favorite${favCount === 1 ? '' : 's'}`"
        >
          <UIcon
            name="i-lucide-heart"
            class="cam-card__favcount-icon"
          />
          {{ favCount }}
        </span>
      </span>
    </span>
  </article>
</template>

<style scoped>
.cam-card {
  position: relative;
  z-index: 0;
  display: flex;
  flex-direction: column;
  text-align: left;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  background: var(--glass, rgba(12, 17, 16, 0.55));
  color: var(--text, #f4f6f5);
  transition: border-color 160ms ease;
}

.cam-card:hover {
  border-color: var(--phosphor-soft);
}

.cam-card__hit {
  position: absolute;
  inset: 0;
  z-index: 1;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  appearance: none;
  border-radius: inherit;
}

.cam-card:has(.cam-card__hit:focus-visible) {
  outline: 2px solid var(--phosphor);
  outline-offset: 2px;
}

.cam-card__fav {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.12));
  /* No backdrop-filter here: two blur regions per card × a 60-card grid is a
     real compositing cost, and over a dark thumbnail the blur is invisible.
     A slightly more opaque background reads the same. */
  background: rgba(0, 0, 0, 0.7);
  color: var(--text-dim, #8b9591);
  cursor: pointer;
  appearance: none;
  transition: color 140ms ease, border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.cam-card__fav:hover {
  color: var(--text, #f4f6f5);
}

.cam-card__fav:focus-visible {
  outline: 2px solid var(--phosphor);
  outline-offset: 1px;
}

.cam-card__fav--active {
  color: var(--phosphor);
  border-color: var(--phosphor-soft);
  background: rgb(var(--phosphor-rgb) / 0.16);
}

.cam-card__fav-icon {
  width: 14px;
  height: 14px;
}

.cam-card__frame {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  overflow: hidden;
  /* The frame rounds its own top corners: 12px outer radius − 1px border. */
  border-radius: 11px 11px 0 0;
}

.cam-card__skeleton {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.cam-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 240ms ease;
}

.cam-card__img--ready {
  opacity: 1;
}

.cam-card__nosignal {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  letter-spacing: 0.32em;
  text-indent: 0.32em;
  color: var(--text-mute, #58615d);
}

.cam-card__badge {
  position: absolute;
  top: 8px;
  left: 8px;
}

.cam-card__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px 11px;
  min-width: 0;
}

.cam-card__location {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cam-card__sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.cam-card__org {
  font-size: 11px;
  color: var(--text-dim, #8b9591);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cam-card__favcount {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--phosphor);
  font-variant-numeric: tabular-nums;
}

.cam-card__favcount-icon {
  width: 10px;
  height: 10px;
}
</style>
