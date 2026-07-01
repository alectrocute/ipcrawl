<script setup lang="ts">
import type { ExploreFeedBadgeTone } from '../../utils/feedBadge'

interface Props {
  tone: ExploreFeedBadgeTone
  label: string
  size?: 'sm' | 'md' | 'lg'
  /** Apply a backdrop blur (used when the badge sits over a live video frame). */
  backdrop?: boolean
}

withDefaults(defineProps<Props>(), {
  size: 'md',
  backdrop: false
})
</script>

<template>
  <span
    class="feed-badge"
    :class="[`feed-badge--${tone}`, `feed-badge--${size}`, { 'feed-badge--backdrop': backdrop }]"
  >
    <UIcon
      v-if="tone === 'connecting'"
      name="i-lucide-loader-circle"
      class="feed-badge__spinner"
    />
    <span
      v-else-if="tone === 'live'"
      class="feed-badge__dot"
    />
    {{ label }}
  </span>
</template>

<style scoped>
.feed-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.12em;
  border: 1px solid transparent;
  white-space: nowrap;
  color: var(--text-dim);
  border-color: var(--hairline, rgba(255, 255, 255, 0.12));
  background: rgba(0, 0, 0, 0.7);
}

.feed-badge--backdrop {
  backdrop-filter: blur(3px);
  overflow: hidden;
}

/* --- Sizes --- */
.feed-badge--sm {
  gap: 5px;
  padding: 3px 7px;
  font-size: 10px;
}

.feed-badge--md {
  gap: 6px;
  padding: 4px 9px;
  font-size: 10px;
}

.feed-badge--lg {
  gap: 6px;
  padding: 5px 11px;
  font-size: 11px;
}

/* --- Dot / spinner --- */
.feed-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(255, 91, 91);
}

.feed-badge--lg .feed-badge__dot {
  width: 7px;
  height: 7px;
}

.feed-badge__spinner {
  width: 11px;
  height: 11px;
  color: var(--text-dim);
  animation: feed-badge-spin 0.8s linear infinite;
}

@keyframes feed-badge-spin {
  to { transform: rotate(360deg); }
}
</style>
