<script setup lang="ts">
import type { NuxtError } from '#app'

defineOptions({ name: 'ErrorPage' })

const props = defineProps<{ error: NuxtError }>()

const { isImceContext } = useImceContext()

// A missing route is almost always a stale deep-link (every bit of explorer
// state lives in the query string, so a bare path can drift). Bounce those
// straight back to the default view. Everything else — 500s, fetch failures,
// thrown errors — gets a real, branded page so the viewer knows what happened
// instead of being silently teleported home.
const isNotFound = computed(() => props.error.statusCode === 404)

const notFoundTarget = computed(() => isImceContext.value ? '/imce' : '/')

onMounted(() => {
  if (isNotFound.value) navigateTo(notFoundTarget.value)
})

const heading = computed(() => `${props.error.statusCode || 500}`)
const message = computed(() =>
  props.error.statusMessage || props.error.message || 'Something went wrong on our end.'
)

// The IMCE campaign surface gets its own copy and icon so the marketing domain
// reads as a server fault, while the primary site keeps the "signal lost"
// radar beat. Both ride the same StatusShell template though.
const shellTitle = computed(() => isImceContext.value ? 'Server error' : 'Signal lost')
const shellIcon = computed(() => isImceContext.value ? 'i-lucide-server-off' : 'i-lucide-radar')
const shellIconPulse = computed(() => !isImceContext.value)

useSeoMeta({
  title: () => `Error ${heading.value} — IP Crawl`
})

const route = useRoute()

// clearError unwinds Nuxt's error state before navigating, so the catalogue
// mounts fresh rather than re-rendering this page.
function goHome() {
  clearError({ redirect: notFoundTarget.value })
}

function retry() {
  clearError({ redirect: route.fullPath })
}
</script>

<template>
  <!-- 404s redirect on mount; render nothing for them to avoid a flash. -->
  <template v-if="!isNotFound">
    <StatusShell
      :title="shellTitle"
      :icon="shellIcon"
      :icon-pulse="shellIconPulse"
      :message="message"
      :hint="`Server error ${heading}`"
      hint-variant="warn"
    >
      <template #actions>
        <UButton
          v-if="isImceContext"
          icon="i-lucide-rotate-cw"
          color="neutral"
          variant="solid"
          class="imce__intro-btn"
          @click="retry"
        >
          Try again
        </UButton>
        <UButton
          v-else
          icon="i-lucide-arrow-left"
          color="primary"
          variant="solid"
          class="imce__intro-btn"
          @click="goHome"
        >
          Back to the catalog
        </UButton>
      </template>
    </StatusShell>
  </template>
  <div v-else />
</template>
