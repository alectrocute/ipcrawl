<script setup lang="ts">
const emit = defineEmits<{
  (e: 'show'): void
}>()
</script>

<template>
  <button
    type="button"
    class="show-map"
    title="Open the guessing map"
    @click="emit('show')"
  >
    <svg
      class="show-map__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2z" />
      <path d="M9 3v16" />
      <path d="M15 5v16" />
    </svg>
    <span class="show-map__label">SHOW MAP</span>
  </button>
</template>

<style scoped>
.show-map {
  appearance: none;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  height: 100%;
  border: 1px solid rgb(var(--phosphor-rgb) / 0.5);
  border-radius: 999px;
  background: rgb(var(--phosphor-rgb) / 0.08);
  color: var(--phosphor-bright);
  font-family: var(--font-mono);
  font-size: clamp(13px, 1.3vw, 16px);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-indent: 0.18em;
  padding: 0.85em 1.2em;
  cursor: pointer;
  text-transform: uppercase;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.show-map:hover,
.show-map:focus-visible {
  border-color: var(--phosphor);
  background: rgb(var(--phosphor-rgb) / 0.16);
  outline: none;
}

.show-map__icon {
  width: 1.1em;
  height: 1.1em;
  flex: 0 0 auto;
}

@media (max-width: 480px) {
  .show-map__label {
    display: none;
  }

  .show-map {
    padding: 0.85em 0.95em;
  }
}
</style>
