<script setup lang="ts">
import type { StatsBucket } from '#shared/stats'

const props = defineProps<{
  items: StatsBucket[]
  /** Denominator for the share column (the full catalogue, not just top-N). */
  total: number
}>()

// Bars scale against the local max (best visual resolution); the printed
// percentage is the share of the whole catalogue.
const max = computed(() => Math.max(1, ...props.items.map(item => item.count)))

function widthPct(count: number): string {
  return `${(count / max.value) * 100}%`
}

function livePct(item: StatsBucket): string {
  if (item.count <= 0) return '0%'
  return `${(item.live / item.count) * 100}%`
}

function shareLabel(count: number): string {
  if (props.total <= 0) return '—'
  const pct = (count / props.total) * 100
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`
}
</script>

<template>
  <div class="bar-list">
    <div
      v-for="(item, i) in items"
      :key="item.value"
      class="bar-list__row"
    >
      <div class="bar-list__meta">
        <span class="bar-list__rank">{{ String(i + 1).padStart(2, '0') }}</span>
        <span
          class="bar-list__label"
          :title="item.value"
        >{{ item.value }}</span>
        <span class="bar-list__numbers">
          <span class="bar-list__count">{{ item.count.toLocaleString('en-US') }}</span>
          <span class="bar-list__share">{{ shareLabel(item.count) }}</span>
        </span>
      </div>
      <div class="bar-list__track">
        <div
          class="bar-list__fill"
          :style="{ width: widthPct(item.count) }"
        >
          <div
            v-if="item.live > 0"
            class="bar-list__live"
            :style="{ width: livePct(item) }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bar-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bar-list__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-list__meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
}

.bar-list__rank {
  flex: none;
  font-size: 10px;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  color: var(--text-mute, #58615d);
}

.bar-list__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text, #f4f6f5);
}

.bar-list__numbers {
  flex: none;
  margin-left: auto;
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  font-variant-numeric: tabular-nums;
}

.bar-list__count {
  color: var(--text-dim, #8b9591);
  font-size: 12px;
}

.bar-list__share {
  min-width: 38px;
  text-align: right;
  color: var(--phosphor);
  font-size: 11px;
  font-weight: 700;
}

.bar-list__track {
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.bar-list__fill {
  position: relative;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    rgb(var(--phosphor-rgb) / 0.22) 0%,
    rgb(var(--phosphor-rgb) / 0.78) 100%
  );
}

/* Live overlay — the brighter leading strip is the slice that answers a probe
   right now. Scales with the parent's fill, which keeps it honest as a
   fraction of the bar at all times. */
.bar-list__live {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 4px;
  background: var(--phosphor-bright);
}
</style>
