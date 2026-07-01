<script setup lang="ts">
import { useViewportNudgedPopover } from '../../composables/useViewportNudgedPopover'

const props = withDefaults(defineProps<{
  visible?: boolean
  active?: boolean
}>(), {
  visible: false,
  active: false
})

const message = computed(() => props.active
  ? 'Live status is best-effort: many public cameras are hard to verify. Feeds may update slowly, freeze, loop, be fake, or show inaccurate timestamps.'
  : 'This is the last tracked image from the feed. The camera has since become unreachable, so live probing is not available for this channel.'
)

const popover = ref<HTMLElement | null>(null)
const { popoverStyle } = useViewportNudgedPopover(popover, {
  visible: computed(() => props.visible),
  align: 'center'
})
</script>

<template>
  <Transition name="live-pop">
    <div
      v-if="visible"
      ref="popover"
      class="live-popover"
      :style="popoverStyle"
    >
      <div class="live-popover__bubble">
        {{ message }}
      </div>
      <svg
        class="live-popover__tail"
        viewBox="0 0 16 10"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M 0 0 L 8 10 L 16 0"
          class="live-popover__tail-fill"
        />
        <path
          d="M 0 0 L 8 10 L 16 0"
          class="live-popover__tail-stroke"
        />
      </svg>
    </div>
  </Transition>
</template>

<style scoped>
.live-popover {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(calc(-50% + var(--popover-nudge, 0px)));
  z-index: 20;
  pointer-events: none;
}

.live-popover__bubble {
  width: clamp(180px, 24vw, 260px);
  max-width: calc(100vw - 24px);
  box-sizing: border-box;
  padding: 9px 11px;
  font-size: 11px;
  white-space: normal;
  overflow-wrap: anywhere;
  text-wrap: balance;
  font-family: var(--font-mono);
  text-transform: none;
  font-weight: 450;
  line-height: 1.5;
  letter-spacing: 0.015em;
  background: rgba(4, 14, 10, 0.82);
  backdrop-filter: blur(6px);
  border: 1px solid rgb(var(--phosphor-rgb) / 0.5);
  border-radius: 12px;
  color: #d8ffe9;
}

.live-popover__tail {
  position: absolute;
  top: 100%;
  left: 50%;
  margin-top: -1px;
  width: 16px;
  height: 10px;
  transform: translateX(calc(-50% + var(--popover-tail-nudge, 0px)));
  overflow: visible;
}

.live-popover__tail-fill {
  fill: rgba(4, 14, 10, 0.82);
}

.live-popover__tail-stroke {
  fill: none;
  stroke: rgb(var(--phosphor-rgb) / 0.5);
  stroke-width: 1.2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.live-pop-enter-active,
.live-pop-leave-active {
  transition: opacity 200ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.live-pop-enter-from,
.live-pop-leave-to {
  opacity: 0;
  transform: translateX(calc(-50% + var(--popover-nudge, 0px))) scale(0.92) translateY(6px);
}
</style>
