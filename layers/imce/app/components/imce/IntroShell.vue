<script setup lang="ts">
defineOptions({ name: 'ImceIntroShell' })

withDefaults(defineProps<{
  title: string
  icon?: string
  iconPulse?: boolean
  showFineprint?: boolean
  standalone?: boolean
}>(), {
  icon: 'i-lucide-scan-eye',
  iconPulse: false,
  showFineprint: true,
  standalone: false
})
</script>

<template>
  <div
    class="imce-intro-shell"
    :class="{ 'imce-intro-shell--standalone': standalone }"
  >
    <div class="imce__veil">
      <div class="imce__intro">
        <span
          class="imce__eye"
          :class="{ 'imce__eye--searching': iconPulse }"
          aria-hidden="true"
        >
          <UIcon :name="icon" />
        </span>

        <h1 class="imce__intro-title">
          {{ title }}
        </h1>

        <div class="imce__intro-body">
          <slot />
        </div>

        <div
          v-if="$slots.actions"
          class="imce__intro-actions"
        >
          <slot name="actions" />
        </div>

        <p
          v-if="showFineprint"
          class="imce__intro-fineprint"
        >
          Powered by <NuxtLink
            to="/"
            class="imce__intro-link"
          >IP Crawl</NuxtLink>.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.imce-intro-shell:not(.imce-intro-shell--standalone) {
  position: absolute;
  inset: 0;
}

.imce-intro-shell--standalone {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.imce__veil {
  position: absolute;
  inset: 0;
  z-index: 1002;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 50% 40%, rgba(255, 138, 76, 0.07), transparent 60%),
    var(--bg-0, #040605);
}

.imce__intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 420px;
  padding: 32px 28px 26px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 18px;
  background: var(--glass-strong, rgba(7, 11, 10, 0.82));
}

.imce__eye {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  margin-bottom: 18px;
  border-radius: 16px;
  font-size: 30px;
  color: var(--imce-alert, #ff8a4c);
  background: rgba(255, 138, 76, 0.1);
}

.imce__eye--searching {
  animation: imce-eye-pulse 1.8s ease-in-out infinite;
}

@keyframes imce-eye-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

.imce__intro-title {
  margin: 0 0 12px;
  font-size: clamp(22px, 4vw, 28px);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text, #f4f6f5);
}

.imce__intro-body :deep(.imce__intro-text) {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text-dim, #8b9591);
}

.imce__intro-body :deep(.imce__intro-hint) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 18px 0 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-mute, #58615d);
}

.imce__intro-body :deep(.imce__intro-hint--warn) {
  color: var(--imce-alert, #ff8a4c);
}

.imce__intro-body :deep(.imce__intro-spin) {
  width: 14px;
  height: 14px;
  animation: imce-spin 0.8s linear infinite;
}

.imce__intro-actions :deep(.imce__intro-btn) {
  margin-top: 20px;
}

.imce__intro-fineprint {
  margin: 22px 0 0;
  font-size: 11px;
  color: var(--text-mute, #58615d);
}

.imce__intro-link {
  color: var(--phosphor);
  text-decoration: none;
}

.imce__intro-link:hover {
  text-decoration: underline;
}

@keyframes imce-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .imce__intro-body :deep(.imce__intro-spin) {
    animation: none;
  }

  .imce__eye--searching {
    animation: none;
  }
}
</style>
