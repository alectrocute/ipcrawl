<script setup lang="ts">
interface Props {
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<{
  (e: 'next'): void
}>()
</script>

<template>
  <button
    class="next-button"
    :class="{ 'next-button--loading': props.loading }"
    type="button"
    :disabled="props.loading"
    @click="emit('next')"
  >
    <span class="next-button__text">
      {{ props.loading ? 'TUNING' : 'NEXT' }}
      <span
        v-if="props.loading"
        class="next-button__dots"
        aria-hidden="true"
      >
        <i />
        <i />
        <i />
      </span>
    </span>
    <kbd
      v-if="!props.loading"
      class="next-button__hint"
    >SPACE</kbd>
  </button>
</template>

<style scoped>
.next-button {
  position: relative;
  appearance: none;
  border: 1px solid rgb(var(--phosphor-rgb) / 0.5);
  border-radius: 999px;
  background: rgb(var(--phosphor-rgb) / 0.08);
  color: var(--phosphor-bright);
  font-family: var(--font-mono);
  font-size: clamp(13px, 1.3vw, 16px);
  font-weight: 700;
  letter-spacing: 0.22em;
  text-indent: 0.22em;
  padding: 0.85em 1.5em 0.85em 1.7em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.9em;
  text-transform: uppercase;
  transition:
    border-color 140ms ease,
    background 140ms ease;
}

.next-button:hover:not(:disabled) {
  border-color: var(--phosphor);
  background: rgb(var(--phosphor-rgb) / 0.16);
}

.next-button:active:not(:disabled) {
  transform: translateY(1px);
}

.next-button:focus-visible {
  outline: 2px solid var(--phosphor);
  outline-offset: 2px;
}

.next-button:disabled {
  cursor: progress;
  color: var(--phosphor);
  opacity: 0.85;
}

.next-button__text {
  display: inline-flex;
  align-items: center;
}

.next-button__dots {
  display: inline-flex;
  gap: 2px;
  margin-left: 0.35em;
  align-items: flex-end;
  margin-top: 9px;
}

.next-button__dots i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  animation: next-dot 1s ease-in-out infinite;
}

.next-button__dots i:nth-child(2) { animation-delay: 0.15s; }
.next-button__dots i:nth-child(3) { animation-delay: 0.3s; }

@keyframes next-dot {
  0%, 100% { opacity: 0.3; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-2px); }
}

.next-button__hint {
  font-family: var(--font-mono);
  font-size: 0.72em;
  font-weight: 600;
  color: var(--phosphor);
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgb(var(--phosphor-rgb) / 0.3);
  border-bottom-width: 2px;
  padding: 0.2em 0.55em;
  border-radius: 5px;
  letter-spacing: 0.12em;
  text-indent: 0.12em;
}

@media (max-width: 640px) {
  .next-button__hint {
    display: none;
  }
}
</style>
