<script setup lang="ts">
const props = defineProps<{
  label: string
  keepOpen?: boolean
}>()

const emit = defineEmits<{
  (e: 'select'): void
}>()

const closeMenu = inject<(() => void) | null>('closeExtrasMenu', null)

function onClick() {
  emit('select')
  if (!props.keepOpen) closeMenu?.()
}
</script>

<template>
  <button
    type="button"
    class="extras-menu-item"
    role="menuitem"
    @click="onClick"
  >
    <span
      v-if="$slots.icon"
      class="extras-menu-item__icon"
      aria-hidden="true"
    >
      <slot name="icon" />
    </span>
    <span class="extras-menu-item__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.extras-menu-item {
  appearance: none;
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65em;
  min-height: 2.4em;
  padding: 0.45em 0.75em;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.92em;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.extras-menu-item:hover,
.extras-menu-item:focus-visible {
  background: rgb(var(--phosphor-rgb) / 0.12);
  color: #b9ffd9;
  outline: none;
}

.extras-menu-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1em;
  height: 1.1em;
  flex: 0 0 auto;
  color: var(--stumble-accent);
}

.extras-menu-item__icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.extras-menu-item__label {
  min-width: 0;
}

.extras-menu-item--copied {
  color: var(--stumble-dim);
}
</style>
