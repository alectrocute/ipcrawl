<script setup lang="ts">
const props = defineProps<{
  label: string
  value: number
  /** Renders the pulsing phosphor dot next to the label. */
  live?: boolean
  hint?: string
}>()

// Fixed locale so SSR and client always agree on grouping separators.
const formatted = computed(() => props.value.toLocaleString('en-US'))
</script>

<template>
  <div class="stat-tile">
    <span class="stat-tile__label">
      <span
        v-if="live"
        class="stat-tile__pulse"
        aria-hidden="true"
      />
      {{ label }}
    </span>
    <span class="stat-tile__value">{{ formatted }}</span>
    <span
      v-if="hint"
      class="stat-tile__hint"
    >{{ hint }}</span>
  </div>
</template>

<style scoped>
.stat-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px 16px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgb(var(--phosphor-rgb) / 0.045) 0%, transparent 45%),
    var(--glass, rgba(12, 17, 16, 0.55));
  transition: border-color 160ms ease, transform 160ms ease;
}

.stat-tile__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-mute, #58615d);
}

.stat-tile__pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--phosphor);
  animation: tile-pulse 2.2s ease-in-out infinite;
}

@keyframes tile-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.stat-tile__value {
  font-size: clamp(26px, 3.4vw, 34px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--text, #f4f6f5);
}

.stat-tile__hint {
  font-size: 11.5px;
  color: var(--text-dim, #8b9591);
}
</style>
