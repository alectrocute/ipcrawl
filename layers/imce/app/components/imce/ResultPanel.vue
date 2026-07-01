<script setup lang="ts">
import type { ImceNearbyResponse } from '#shared/imce'

defineOptions({ name: 'ImceResultPanel' })

const props = defineProps<{ nearby: ImceNearbyResponse | null }>()
const emit = defineEmits<{ rescan: [], select: [id: string] }>()

const found = computed(() => (props.nearby?.count ?? 0) > 0)
const count = computed(() => props.nearby?.count ?? 0)
const radiusKm = computed(() => props.nearby?.radiusKm ?? 0)
const truncated = computed(() => props.nearby?.truncated ?? false)

// Distance read in whichever unit keeps it legible: metres under a km, else km.
function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined) return ''
  if (km < 1) return `${Math.max(10, Math.round(km * 1000))} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

const nearestLabel = computed(() => formatKm(props.nearby?.nearestKm))
const radiusLabel = computed(() => formatKm(radiusKm.value))
const camerasShown = computed(() => props.nearby?.cameras ?? [])

const countLabel = computed(() => (truncated.value ? `${count.value}+` : `${count.value}`))

const headline = computed(() =>
  found.value
    ? `Exposed cameras found nearby you!`
    : 'No exposed cameras found nearby'
)

// Trailing clause naming the closest camera, only when we have a distance. Kept
// as a string so the lede stays one clean text flow (no whitespace-sensitive
// inline <template> around the period).
const nearestSuffix = computed(() =>
  nearestLabel.value ? ` Closest: ${nearestLabel.value}.` : ''
)
</script>

<template>
  <section
    class="imce-result"
    :class="found ? 'imce-result--alert' : 'imce-result--clear'"
    role="status"
    aria-live="polite"
  >
    <h2 class="imce-result__title">
      {{ headline }}
    </h2>

    <p
      v-if="found"
      class="imce-result__lede"
    >
      It looks like <strong>{{ countLabel }} {{ count === 1 ? 'camera' : 'cameras' }}</strong> within <strong>{{ radiusLabel }}</strong>
      of you {{ count === 1 ? 'is' : 'are' }} exposed to the public internet. {{ nearestSuffix }}
    </p>
    <p
      v-else
      class="imce-result__lede"
    >
      Nothing in the catalogue within <strong>{{ radiusLabel }}</strong>
      of you. The list isn't complete, so still check any cameras you own.
    </p>

    <div
      v-if="found && camerasShown.length"
      class="imce-result__thumbs"
    >
      <button
        v-for="cam in camerasShown.slice(0, 8)"
        :key="cam.id"
        type="button"
        class="imce-result__thumb"
        :title="`Open camera ${cam.id}`"
        @click="emit('select', cam.id)"
      >
        <img
          :src="cam.thumb"
          loading="lazy"
          alt=""
          referrerpolicy="no-referrer"
        >
        <span
          v-if="cam.live"
          class="imce-result__thumb-live"
          title="Live now"
        />
      </button>
      <div
        v-if="count > camerasShown.slice(0, 8).length"
        class="imce-result__thumb imce-result__thumb--more"
      >
        +{{ count - camerasShown.slice(0, 8).length }}
      </div>
    </div>

    <p
      v-if="found"
      class="imce-result__steps"
    >
      If a pin looks like the view from one of your cameras, unplug it from
      power and internet now, and leave it off until someone secures or
      replaces it.
    </p>

    <div class="imce-result__actions">
      <UButton
        icon="i-lucide-rotate-cw"
        color="neutral"
        variant="subtle"
        size="md"
        @click="emit('rescan')"
      >
        Scan again
      </UButton>
      <UButton
        to="/"
        icon="i-lucide-grid-2x2"
        color="neutral"
        variant="ghost"
        size="md"
      >
        Browse the catalogue
      </UButton>
    </div>

    <p class="imce-result__fineprint">
      Locations are approximate. This only checks IP Crawl's public list —
      not a full security audit.
    </p>
  </section>
</template>

<style scoped>
.imce-result {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px 22px 18px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 16px;
  background: var(--glass-strong, rgba(7, 11, 10, 0.92));
  backdrop-filter: blur(12px);
}

.imce-result--alert {
  border-color: var(--imce-alert-soft, rgba(255, 138, 76, 0.55));
}

.imce-result--clear {
  border-color: var(--phosphor-soft);
}

.imce-result__title {
  margin: 0;
  font-size: clamp(18px, 2.6vw, 22px);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--text, #f4f6f5);
}

.imce-result--alert .imce-result__title {
  color: var(--imce-alert-bright, #ffb088);
}

.imce-result__lede {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-dim, #8b9591);
}

.imce-result__lede strong {
  color: var(--text, #f4f6f5);
  font-weight: 700;
}

.imce-result__thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.imce-result__thumb {
  position: relative;
  width: 72px;
  height: 54px;
  padding: 0;
  border-radius: 7px;
  overflow: hidden;
  border: 1px solid var(--hairline-strong, rgba(255, 255, 255, 0.16));
  background: #000;
  cursor: pointer;
  appearance: none;
  transition: transform 140ms ease, border-color 140ms ease;
}

.imce-result__thumb:hover {
  border-color: var(--phosphor-soft);
}

.imce-result__thumb:focus-visible {
  outline: 2px solid var(--phosphor);
  outline-offset: 1px;
}

.imce-result__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.imce-result__thumb-live {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--phosphor);
}

.imce-result__thumb--more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-dim, #8b9591);
  background: var(--bg-2, #0b0f0e);
  font-variant-numeric: tabular-nums;
}

.imce-result__steps {
  margin: 2px 0 0;
  padding: 12px 14px;
  border-left: 2px solid var(--imce-alert, #ff8a4c);
  border-radius: 0 8px 8px 0;
  background: rgba(255, 138, 76, 0.06);
  font-size: 14px;
  line-height: 1.55;
  color: var(--text, #f4f6f5);
}

.imce-result__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.imce-result__fineprint {
  margin: 2px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-mute, #58615d);
}
</style>
