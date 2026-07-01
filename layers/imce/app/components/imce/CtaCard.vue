<script setup lang="ts">
defineOptions({ name: 'ImceCtaCard' })
</script>

<template>
  <NuxtLink
    to="/imce"
    class="imce-cta"
  >
    <span
      class="imce-cta__scan"
      aria-hidden="true"
    />

    <div class="imce-cta__head">
      <UIcon
        name="i-lucide-scan-eye"
        class="imce-cta__icon"
      />
      <span class="imce-cta__title">Am I Being Watched?</span>
    </div>

    <p class="imce-cta__sub">
      Check if any camera near you is exposed. Less than 10 seconds. No login required.
    </p>

    <span class="imce-cta__action">
      ismycameraexposed.com
      <UIcon
        name="i-lucide-arrow-right"
        class="imce-cta__action-arrow"
      />
    </span>
  </NuxtLink>
</template>

<style scoped>
.imce-cta {
  position: relative;
  z-index: 0;
  display: block;
  overflow: hidden;
  padding: 15px 16px 14px;
  border: 1px solid var(--imce-alert-soft, rgba(255, 138, 76, 0.55));
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 138, 76, 0.12) 0%, rgba(255, 138, 76, 0.04) 100%),
    var(--glass, rgba(12, 17, 16, 0.55));
  text-decoration: none;
  transition: border-color 160ms ease, transform 160ms ease;
}

.imce-cta:hover {
  border-color: var(--imce-alert, #ff8a4c);
}

.imce-cta:focus-visible {
  outline: 2px solid var(--imce-alert, #ff8a4c);
  outline-offset: 2px;
}

.imce-cta__head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.imce-cta__icon {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  color: var(--imce-alert-bright, #ffb088);
}

.imce-cta__title {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--imce-alert-bright, #ffb088);
}

.imce-cta__sub {
  margin: 9px 0 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: #fed5c1;
}

.imce-cta__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 11px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--imce-alert, #ff8a4c);
}

.imce-cta__action-arrow {
  width: 13px;
  height: 13px;
  transition: transform 160ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .imce-cta__glow {
    animation: none;
    opacity: 0.8;
  }

  .imce-cta__scan {
    display: none;
  }
}
</style>
