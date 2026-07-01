<script setup lang="ts">
defineProps<{
  label: string
}>()

const checked = defineModel<boolean>({ default: false })

function onChange(event: Event) {
  checked.value = (event.target as HTMLInputElement).checked
}
</script>

<template>
  <label
    class="extras-menu-toggle"
    role="menuitemcheckbox"
    :aria-checked="checked"
  >
    <span
      v-if="$slots.icon"
      class="extras-menu-toggle__icon"
      aria-hidden="true"
    >
      <slot name="icon" />
    </span>
    <span class="extras-menu-toggle__label">{{ label }}</span>
    <span class="extras-menu-toggle__switch">
      <input
        class="extras-menu-toggle__input"
        type="checkbox"
        :checked="checked"
        @change="onChange"
        @click.stop
      >
      <span
        class="extras-menu-toggle__track"
        aria-hidden="true"
      >
        <span class="extras-menu-toggle__thumb" />
      </span>
    </span>
  </label>
</template>

<style scoped>
.extras-menu-toggle {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65em;
  min-height: 2.4em;
  padding: 0.45em 0.75em;
  border-radius: 8px;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.92em;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.extras-menu-toggle:hover,
.extras-menu-toggle:has(:focus-visible) {
  background: rgb(var(--phosphor-rgb) / 0.12);
  color: #b9ffd9;
}

.extras-menu-toggle__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1em;
  height: 1.1em;
  flex: 0 0 auto;
  color: rgb(255, 130, 130);
}

.extras-menu-toggle__icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.extras-menu-toggle__label {
  min-width: 0;
  flex: 1 1 auto;
}

.extras-menu-toggle__switch {
  position: relative;
  flex: 0 0 auto;
}

.extras-menu-toggle__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.extras-menu-toggle__input:focus-visible + .extras-menu-toggle__track {
  outline: 2px solid rgb(var(--phosphor-rgb) / 0.55);
  outline-offset: 2px;
}

.extras-menu-toggle__track {
  display: block;
  width: 2.1em;
  height: 1.15em;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.14);
  transition: background 140ms ease, border-color 140ms ease;
}

.extras-menu-toggle__input:checked + .extras-menu-toggle__track {
  background: rgb(var(--phosphor-rgb) / 0.35);
  border-color: rgb(var(--phosphor-rgb) / 0.55);
}

.extras-menu-toggle__thumb {
  display: block;
  width: 0.85em;
  height: 0.85em;
  margin: 0.08em;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.82);
  transition: transform 140ms ease, background 140ms ease;
}

.extras-menu-toggle__input:checked + .extras-menu-toggle__track .extras-menu-toggle__thumb {
  transform: translateX(0.95em);
  background: #b9ffd9;
}
</style>
