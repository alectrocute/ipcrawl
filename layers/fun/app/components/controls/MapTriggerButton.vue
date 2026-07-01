<script setup lang="ts">
const emit = defineEmits<{
  (e: 'hover', hovering: boolean): void
}>()
</script>

<template>
  <button
    type="button"
    class="map-trigger"
    aria-label="Show location on map"
    @mouseenter="emit('hover', true)"
    @mouseleave="emit('hover', false)"
    @focus="emit('hover', true)"
    @blur="emit('hover', false)"
  >
    <svg
      class="map-trigger__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2z" />
      <path d="M9 3v16" />
      <path d="M15 5v16" />
    </svg>
  </button>
</template>

<style scoped>
.map-trigger {
  appearance: none;
  box-sizing: border-box;
  background: rgb(var(--phosphor-rgb) / 0.04);
  border: 1px solid rgb(var(--phosphor-rgb) / 0.35);
  border-radius: 8px;
  color: var(--stumble-accent);
  width: 1.95em;
  height: 1.95em;
  min-width: 1.95em;
  min-height: 1.95em;
  padding: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  line-height: 0;
  cursor: help;
  transition: background 140ms ease, border-color 140ms ease,
    color 140ms ease, transform 140ms ease;
}

.map-trigger:hover,
.map-trigger:focus-visible {
  background: rgb(var(--phosphor-rgb) / 0.12);
  border-color: var(--stumble-accent);
  color: #b9ffd9;
  outline: none;
}

.map-trigger__icon {
  width: 1.05em;
  height: 1.05em;
}
</style>
