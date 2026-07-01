<script setup lang="ts">
defineProps<{
  active?: boolean
}>()

const emit = defineEmits<{
  (e: 'hover', hovering: boolean): void
}>()
</script>

<template>
  <span
    class="live-indicator"
    :class="{ 'live-indicator--active': active }"
    role="status"
    tabindex="0"
    :aria-label="active ? 'Live probing active' : 'Camera offline; showing last tracked still'"
    :title="active ? 'Live feed' : 'Last tracked still'"
    @mouseenter="emit('hover', true)"
    @mouseleave="emit('hover', false)"
    @focus="emit('hover', true)"
    @blur="emit('hover', false)"
  >
    <ControlsLiveProbeSpinner v-if="active" />
    <svg
      v-else
      class="live-indicator__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="3.2"
      />
    </svg>
  </span>
</template>

<style scoped>
.live-indicator {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.95em;
  height: 1.95em;
  min-width: 1.95em;
  min-height: 1.95em;
  border: 1px solid rgb(var(--phosphor-rgb) / 0.22);
  border-radius: 8px;
  background: rgb(var(--phosphor-rgb) / 0.03);
  color: rgb(var(--phosphor-rgb) / 0.45);
  flex: 0 0 auto;
  line-height: 0;
  overflow: hidden;
  outline: none;
  cursor: help;
}

.live-indicator:focus-visible {
  border-color: var(--stumble-accent);
  outline: 2px solid var(--stumble-accent);
  outline-offset: 2px;
}

.live-indicator--active {
  border-color: rgba(255, 130, 130, 0.45);
  background: rgba(255, 130, 130, 0.06);
  color: rgb(255, 130, 130);
}

.live-indicator__icon {
  width: 0.95em;
  height: 0.95em;
}
</style>
