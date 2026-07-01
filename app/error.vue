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
    <ImceIntroShell
      v-if="isImceContext"
      title="Server error"
      icon="i-lucide-server-off"
      standalone
    >
      <p class="imce__intro-text">
        {{ message }}
      </p>
      <p class="imce__intro-hint imce__intro-hint--warn">
        Server error {{ heading }}
      </p>
      <template #actions>
        <UButton
          icon="i-lucide-rotate-cw"
          color="neutral"
          variant="solid"
          class="imce__intro-btn"
          @click="retry"
        >
          Try again
        </UButton>
      </template>
    </ImceIntroShell>

    <div
      v-else
      class="error-page"
    >
      <div class="error-page__inner">
        <header class="error-page__header">
          <IpcrawlLogo tag="div" />
        </header>

        <main class="error-page__body">
          <UIcon
            name="i-lucide-radar"
            class="error-page__icon"
          />
          <p class="error-page__code">
            {{ heading }}
          </p>
          <h1 class="error-page__title">
            Signal lost
          </h1>
          <p class="error-page__message">
            {{ message }}
          </p>
          <UButton
            icon="i-lucide-arrow-left"
            color="primary"
            variant="solid"
            size="lg"
            @click="goHome"
          >
            Back to the catalogue
          </UButton>
        </main>
      </div>
    </div>
  </template>
  <div v-else />
</template>

<style scoped>
/* Same fixed-but-self-scrolling shell as the catalogue/about pages. */
.error-page {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.error-page__inner {
  max-width: 760px;
  margin: 0 auto;
  padding: clamp(12px, 1.6vw, 18px) clamp(18px, 5vw, 32px) 120px;
  view-transition-name: page-shell;
}

.error-page__header {
  display: flex;
  align-items: center;
  padding-bottom: clamp(10px, 1.4vw, 14px);
  margin-bottom: clamp(24px, 4vw, 44px);
  border-bottom: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  view-transition-name: page-header;
}

.error-page__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-top: clamp(32px, 10vh, 96px);
  /* Quiet entrance, matching the about page's settle-in. */
  animation: error-rise 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.error-page__icon {
  width: 56px;
  height: 56px;
  color: var(--phosphor);
  /* Slow sweep, echoing the radar mark in the logo. */
  animation: error-radar 4s linear infinite;
}

.error-page__code {
  margin: 22px 0 0;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: var(--phosphor);
}

.error-page__title {
  margin: 10px 0 0;
  font-size: clamp(28px, 6vw, 44px);
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.1;
  color: var(--text, #f4f6f5);
}

.error-page__message {
  margin: 14px 0 0;
  max-width: 46ch;
  font-size: 14.5px;
  line-height: 1.75;
  color: var(--text-dim, #8b9591);
}

.error-page__body :deep(button),
.error-page__body :deep(a) {
  margin-top: 32px;
}

@keyframes error-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes error-radar {
  to {
    transform: rotate(360deg);
  }
}
</style>
