<script setup lang="ts">
import type { ExploreCamCard, ExploreCamDetail } from '#shared/explore'
import { apiLiveFramePath } from '#shared/routes'
import { EXPLORE_FEED_BADGE_LABEL } from '../../utils/feedBadge'

interface Props {
  card: ExploreCamCard
  /** When true, stop live polling (e.g. the single-cam dialog owns the feed). */
  pauseLive?: boolean
}
const props = withDefaults(defineProps<Props>(), { pauseLive: false })
const emit = defineEmits<{ select: [card: ExploreCamCard] }>()

const label = computed(() => props.card.location || 'Unknown location')

// The hero is the showcase feed, so it polls the live-probe route (not the
// cheap cached thumbnail) so the frame actually moves. The poller only reads
// `id` + `live` off the detail, so a minimal shape is enough.
const { liveSrc, frameErrored } = useLiveFramePoller(
  () => ({
    id: props.card.id,
    live: apiLiveFramePath(props.card.id)
  }) as ExploreCamDetail,
  () => !props.pauseLive
)

// Crossfade: the cached still paints instantly on the front layer; each live
// frame loads into the hidden layer and fades in over it once decoded. We
// ping-pong two stacked layers rather than swap one <img>'s src in place.
const layers = ref([{ src: props.card.thumb }, { src: '' }])
const front = ref(0)

watch(() => props.card.thumb, (thumb) => {
  // New featured card: fall back to its still until a fresh live frame lands.
  layers.value = [{ src: thumb }, { src: '' }]
  front.value = 0
})

watch(liveSrc, (src) => {
  if (!src) return
  layers.value[front.value ^ 1]!.src = src
})

function onLayerLoad(i: number) {
  front.value = i
}

const { has: isFavorite, toggle: toggleFavorite, countOf } = useExploreFavorites()
const fav = computed(() => isFavorite(props.card.id))
const favCount = computed(() => countOf(props.card.id, props.card.favCount))
</script>

<template>
  <article class="featured">
    <button
      type="button"
      class="featured__hit"
      :aria-label="`Open ${label}`"
      @click="emit('select', props.card)"
    />

    <button
      type="button"
      class="featured__fav"
      :class="{ 'featured__fav--active': fav }"
      :aria-pressed="fav"
      :aria-label="fav ? `Remove ${label} from favorites` : `Add ${label} to favorites`"
      @click="toggleFavorite(props.card.id, props.card.favCount)"
    >
      <UIcon
        name="i-lucide-heart"
        class="featured__fav-icon"
      />
    </button>

    <span class="featured__frame">
      <img
        v-for="(layer, i) in layers"
        v-show="layer.src"
        :key="i"
        :src="layer.src"
        :alt="label"
        class="featured__img"
        :class="{ 'featured__img--ready': front === i }"
        referrerpolicy="no-referrer"
        decoding="async"
        @load="onLayerLoad(i)"
      >
      <span
        v-if="frameErrored && !liveSrc"
        class="featured__nosignal"
      >NO SIGNAL</span>

      <span class="featured__badges">
        <span class="featured__badge featured__badge--star">FEATURED</span>
        <ExploreFeedBadge
          :tone="props.card.isLive ? 'live' : 'cached'"
          :label="props.card.isLive ? EXPLORE_FEED_BADGE_LABEL.live : EXPLORE_FEED_BADGE_LABEL.snapshot"
          size="lg"
        />
      </span>

      <span class="featured__overlay">
        <span class="featured__location">{{ label }}</span>
        <span class="featured__sub">
          <span class="featured__org">{{ props.card.org || '—' }}</span>
          <span
            v-if="favCount > 0"
            class="featured__favcount"
            :title="`${favCount} favorite${favCount === 1 ? '' : 's'}`"
          >
            <UIcon
              name="i-lucide-heart"
              class="featured__favcount-icon"
            />
            {{ favCount }}
          </span>
        </span>
      </span>
    </span>
  </article>
</template>

<style scoped>
.featured {
  position: relative;
  z-index: 0;
  display: block;
  margin-bottom: 14px;
  border: 1px solid var(--phosphor-soft);
  border-radius: 16px;
  background: var(--glass, rgba(12, 17, 16, 0.55));
  color: var(--text, #f4f6f5);
  overflow: hidden;
  transition: border-color 160ms ease, transform 160ms ease;
}

.featured:hover {
  border-color: var(--phosphor);
  transform: translateY(-2px);
}

.featured__hit {
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

.featured:has(.featured__hit:focus-visible) {
  outline: 2px solid var(--phosphor);
  outline-offset: 2px;
}

.featured__fav {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.12));
  background: rgba(0, 0, 0, 0.7);
  color: var(--text-dim, #8b9591);
  cursor: pointer;
  appearance: none;
  transition: color 140ms ease, border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.featured__fav:hover {
  color: var(--text, #f4f6f5);
}

.featured__fav:focus-visible {
  outline: 2px solid var(--phosphor);
  outline-offset: 1px;
}

.featured__fav--active {
  color: var(--phosphor);
  border-color: var(--phosphor-soft);
  background: rgb(var(--phosphor-rgb) / 0.16);
}

.featured__fav-icon {
  width: 18px;
  height: 18px;
}

.featured__frame {
  position: relative;
  display: block;
  width: 100%;
  /* Cinematic, and clearly larger than the 4/3 grid tiles. Shorter ratios on
     wide screens keep the hero from dominating the fold; taller on mobile so a
     single-column hero still reads as a feed rather than a letterbox sliver. */
  aspect-ratio: 4 / 3;
  background: #000;
  overflow: hidden;
}

.featured__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
  display: block;
  opacity: 0;
  transition: opacity 240ms ease;
}

.featured__img--ready {
  opacity: 1;
}

.featured__nosignal {
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

.featured__badges {
  position: absolute;
  top: 14px;
  left: 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.featured__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  border: 1px solid transparent;
}

.featured__badge--star {
  color: var(--phosphor-ink);
  background: var(--phosphor);
}

.featured__overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 40px 18px 16px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.45) 50%, transparent 100%);
  pointer-events: none;
}

.featured__location {
  font-size: clamp(16px, 2.2vw, 22px);
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
}

.featured__sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.featured__org {
  font-size: clamp(12px, 1.4vw, 14px);
  color: var(--text-dim, #c2ccc8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.featured__favcount {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--phosphor);
  font-variant-numeric: tabular-nums;
}

.featured__favcount-icon {
  width: 12px;
  height: 12px;
}

@media (min-width: 640px) {
  .featured__frame { aspect-ratio: 16 / 9; }
}

@media (min-width: 1024px) {
  .featured {
    margin-bottom: 18px;
    border-radius: 18px;
  }
  .featured__frame { aspect-ratio: 21 / 9; }
  .featured__overlay { padding: 56px 24px 22px; }
}
</style>
