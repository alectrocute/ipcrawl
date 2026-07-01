<script setup lang="ts">
interface Props {
  src: string | null
}

const props = defineProps<Props>()

// 1x1 transparent GIF — used as a placeholder so the <img> element exists
// (and keeps its last-decoded frame) without a real src.
const EMPTY_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
</script>

<template>
  <div class="crt">
    <div class="crt__bezel">
      <div class="crt__screen">
        <img
          v-show="props.src"
          :src="props.src || EMPTY_PIXEL"
          alt="Live webcam screenshot"
          class="crt__img"
          referrerpolicy="no-referrer"
          decoding="async"
        >
        <div
          v-show="!props.src"
          class="crt__placeholder"
        >
          <span>NO SIGNAL</span>
        </div>

        <div
          class="crt__scanlines"
          aria-hidden="true"
        />
        <div
          class="crt__roll"
          aria-hidden="true"
        />
        <div
          class="crt__vignette"
          aria-hidden="true"
        />
        <div
          class="crt__glow"
          aria-hidden="true"
        />
        <div
          class="crt__reflection"
          aria-hidden="true"
        />

        <slot name="overlay" />
      </div>

      <div
        class="crt__plate"
        aria-hidden="true"
      />
    </div>
  </div>
</template>

<style scoped>
.crt {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* The enclosure: a dark, anodized broadcast monitor. Bevelled top highlight,
   soft bottom shadow, and a generous drop shadow to seat it in the room. */
.crt__bezel {
  position: relative;
  width: 100%;
  height: 100%;
  padding: clamp(12px, 1.6vw, 26px);
  padding-bottom: clamp(26px, 2.6vw, 44px);
  border-radius: clamp(16px, 1.6vw, 26px);
  background:
    linear-gradient(180deg, #2a2e2d 0%, #16191a 14%, #0c0f0f 60%, #060807 100%);
  box-shadow:
    /* crisp top bevel highlight */
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    /* inner base shadow */
    inset 0 -22px 40px -24px rgba(0, 0, 0, 0.9),
    /* lift off the studio floor */
    0 2px 1px rgba(255, 255, 255, 0.04),
    0 40px 80px -28px rgba(0, 0, 0, 0.85),
    0 12px 30px -12px rgba(0, 0, 0, 0.6);
}

.crt__screen {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* Slight tube curvature read via rounded corners + inset framing. */
  border-radius: clamp(10px, 1vw, 18px);
  background: #000;
  box-shadow:
    /* recessed glass set into the bezel */
    inset 0 0 0 1px rgba(0, 0, 0, 0.9),
    inset 0 0 0 2px rgba(255, 255, 255, 0.03),
    inset 0 0 90px rgba(0, 0, 0, 0.92),
    inset 0 0 14px rgb(var(--phosphor-rgb) / 0.06);
}

.crt__img {
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
  object-fit: contain;
  /* Slight phosphor character without crushing the source image. */
  filter: contrast(1.06) saturate(1.08) brightness(0.97);
}

.crt__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--phosphor-bright);
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: clamp(16px, 2.2vw, 26px);
  letter-spacing: 0.5em;
  text-indent: 0.5em;
  text-shadow: 0 0 16px rgb(var(--phosphor-rgb) / 0.7);
  animation: crt-flicker 2.6s infinite;
}

.crt__scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.16) 0px,
    rgba(0, 0, 0, 0.16) 1px,
    transparent 1px,
    transparent 3px
  );
  mix-blend-mode: multiply;
  opacity: 0.5;
}

/* A faint brighter band that slowly rolls down the screen, like a CRT's
   refresh seam. Extremely subtle. */
.crt__roll {
  position: absolute;
  left: 0;
  right: 0;
  height: 28%;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(255, 255, 255, 0.035) 50%,
    transparent
  );
  mix-blend-mode: screen;
  animation: crt-roll 7s linear infinite;
}

.crt__vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    transparent 52%,
    rgba(0, 0, 0, 0.6) 100%
  );
}

.crt__glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow:
    inset 0 0 70px rgb(var(--phosphor-rgb) / 0.05),
    inset 0 0 220px rgba(0, 0, 0, 0.45);
}

/* Glass sheen: a soft diagonal highlight sweeping the top-left of the tube,
   the single biggest cue that there's real glass in front of the image. */
.crt__reflection {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    133deg,
    rgba(255, 255, 255, 0.10) 0%,
    rgba(255, 255, 255, 0.03) 14%,
    transparent 34%
  );
  mix-blend-mode: screen;
}

/* Brushed plate along the chin of the enclosure, with a live power LED. */
.crt__plate {
  position: absolute;
  left: 50%;
  bottom: clamp(7px, 0.9vw, 14px);
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.7em;
  pointer-events: none;
}

.crt__led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--phosphor-bright);
  box-shadow:
    0 0 8px rgb(var(--phosphor-rgb) / 0.9),
    0 0 2px rgb(var(--phosphor-rgb) / 1);
  animation: crt-led 3.2s ease-in-out infinite;
}

.crt__wordmark {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.42em;
  text-indent: 0.42em;
  color: rgba(255, 255, 255, 0.22);
}

@media (max-width: 640px) {
  .crt__wordmark { display: none; }
}

@keyframes crt-led {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

@keyframes crt-roll {
  from { top: -28%; }
  to { top: 100%; }
}

@keyframes crt-flicker {
  0%, 100% { opacity: 0.92; }
  50% { opacity: 1; }
  52% { opacity: 0.45; }
  53% { opacity: 1; }
}
</style>
