<script setup lang="ts">
import { useViewportNudgedPopover } from '../../composables/useViewportNudgedPopover'

const open = defineModel<boolean>('open', { default: false })
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const { popoverStyle: panelStyle } = useViewportNudgedPopover(panel, {
  visible: open,
  align: 'start'
})

let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null

function clearHoverCloseTimer() {
  if (!hoverCloseTimer) return
  clearTimeout(hoverCloseTimer)
  hoverCloseTimer = null
}

function openMenu() {
  clearHoverCloseTimer()
  open.value = true
}

function scheduleClose() {
  clearHoverCloseTimer()
  hoverCloseTimer = setTimeout(() => {
    open.value = false
    hoverCloseTimer = null
  }, 120)
}

function close() {
  clearHoverCloseTimer()
  open.value = false
}

function toggle() {
  open.value = !open.value
}

provide('closeExtrasMenu', close)

function onClickOutside(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node | null
  if (root.value && target && !root.value.contains(target)) close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation()
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  clearHoverCloseTimer()
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="root"
    class="extras-menu"
  >
    <button
      type="button"
      class="extras-menu__trigger"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-label="More actions"
      title="More actions"
      @mouseenter="openMenu"
      @mouseleave="scheduleClose"
      @click.stop="toggle"
    >
      <svg
        class="extras-menu__trigger-icon"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="5"
          r="1.6"
        />
        <circle
          cx="12"
          cy="12"
          r="1.6"
        />
        <circle
          cx="12"
          cy="19"
          r="1.6"
        />
      </svg>
    </button>

    <Transition name="extras-menu">
      <div
        v-if="open"
        ref="panel"
        class="extras-menu__panel"
        :style="panelStyle"
        role="menu"
        @mouseenter="openMenu"
        @mouseleave="scheduleClose"
      >
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.extras-menu {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* Bridge the gap between trigger and panel so hover stays connected. */
.extras-menu:has(.extras-menu__panel)::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  height: 10px;
}

.extras-menu__trigger {
  appearance: none;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.95em;
  height: 1.95em;
  min-width: 1.95em;
  min-height: 1.95em;
  padding: 0;
  margin: 0;
  border: 1px solid rgb(var(--phosphor-rgb) / 0.35);
  border-radius: 8px;
  background: rgb(var(--phosphor-rgb) / 0.04);
  color: var(--stumble-accent);
  line-height: 0;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.extras-menu__trigger:hover,
.extras-menu__trigger:focus-visible,
.extras-menu__trigger[aria-expanded='true'] {
  border-color: var(--stumble-accent);
  background: rgb(var(--phosphor-rgb) / 0.12);
  color: #b9ffd9;
  outline: none;
}

.extras-menu__trigger-icon {
  width: 1em;
  height: 1em;
}

.extras-menu__panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 20;
  min-width: min(11.5em, calc(100vw - 24px));
  max-width: calc(100vw - 24px);
  box-sizing: border-box;
  padding: 0.35em;
  border-radius: 12px;
  background: rgba(4, 14, 10, 0.92);
  backdrop-filter: blur(14px) saturate(1.2);
  border: 1px solid rgb(var(--phosphor-rgb) / 0.25);
  transform: translateX(var(--popover-nudge, 0px));
  transform-origin: bottom left;
}

.extras-menu-enter-active,
.extras-menu-leave-active {
  transition: opacity 160ms ease, transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.extras-menu-enter-from,
.extras-menu-leave-to {
  opacity: 0;
  transform: translateX(var(--popover-nudge, 0px)) scale(0.96) translateY(6px);
}
</style>
