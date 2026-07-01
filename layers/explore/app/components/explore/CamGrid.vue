<script setup lang="ts">
import type { ExploreCamCard } from '#shared/explore'

interface Props {
  items: ExploreCamCard[]
  total: number
  loading: boolean
  skeletonCount?: number
}
const props = withDefaults(defineProps<Props>(), { skeletonCount: 12 })
const emit = defineEmits<{ select: [card: ExploreCamCard] }>()

// Skeletons only on a genuine cold first paint (nothing to show yet). A refetch
// over an existing list dims it in place. The empty state is gated on `total`,
// not a transient empty `items`, so it never flashes mid-refetch.
const showSkeletons = computed(() => props.loading && props.items.length === 0 && props.total === 0)
const showEmpty = computed(() => !props.loading && props.total === 0)
</script>

<template>
  <div>
    <div
      v-if="showSkeletons"
      class="cam-grid"
    >
      <div
        v-for="n in props.skeletonCount"
        :key="`sk-${n}`"
        class="cam-grid__skeleton"
      >
        <USkeleton class="cam-grid__skeleton-frame" />
        <USkeleton class="cam-grid__skeleton-line" />
        <USkeleton class="cam-grid__skeleton-line cam-grid__skeleton-line--short" />
      </div>
    </div>

    <div
      v-else-if="showEmpty"
      class="cam-grid__empty"
    >
      <UIcon
        name="i-lucide-radio"
        class="cam-grid__empty-icon"
      />
      <p class="cam-grid__empty-title">
        No channels match these filters
      </p>
      <p class="cam-grid__empty-hint">
        Try widening your search or switching the source to <strong>All</strong>.
      </p>
    </div>

    <div
      v-else
      class="cam-grid"
      :class="{ 'cam-grid--busy': props.loading }"
    >
      <ExploreCamCard
        v-for="card in props.items"
        :key="card.id"
        :card="card"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.cam-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  transition: opacity 160ms ease;
}

.cam-grid--busy {
  opacity: 0.55;
  pointer-events: none;
}

@media (min-width: 640px) {
  .cam-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
  .cam-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (min-width: 1440px) {
  .cam-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
}

.cam-grid__skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 0 11px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  overflow: hidden;
}

.cam-grid__skeleton-frame {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 0;
}

.cam-grid__skeleton-line {
  height: 11px;
  margin: 0 11px;
  border-radius: 4px;
}

.cam-grid__skeleton-line--short {
  width: 55%;
}

.cam-grid__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 72px 24px;
  text-align: center;
  border: 1px dashed var(--hairline-strong, rgba(255, 255, 255, 0.16));
  border-radius: 14px;
  color: var(--text-dim, #8b9591);
}

.cam-grid__empty-icon {
  width: 30px;
  height: 30px;
  color: var(--phosphor-soft);
}

.cam-grid__empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text, #f4f6f5);
}

.cam-grid__empty-hint {
  margin: 0;
  font-size: 13px;
}
</style>
