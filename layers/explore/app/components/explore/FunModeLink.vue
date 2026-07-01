<script setup lang="ts">
defineOptions({ name: 'ExploreFunModeLink' })
</script>

<template>
  <NuxtLink
    to="/fun"
    class="fun-link"
  >
    <span class="fun-link__label">Console Mode</span>
    <UIcon
      name="i-lucide-tv"
      class="fun-link__icon"
    />
  </NuxtLink>
</template>

<style scoped>
.fun-link {
  position: relative;
  z-index: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 16px;
  border: 1px solid var(--phosphor-soft);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgb(var(--phosphor-rgb) / 0.14) 0%, rgb(var(--phosphor-rgb) / 0.05) 100%),
    var(--glass, rgba(12, 17, 16, 0.55));
  color: var(--phosphor-bright);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  transition: border-color 160ms ease, transform 160ms ease;
}

.fun-link:hover {
  border-color: var(--phosphor);
  transform: translateY(-1px);
}

.fun-link:focus-visible {
  outline: 2px solid var(--phosphor);
  outline-offset: 2px;
}

.fun-link__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* Channel marker slides in like a TV OSD on hover. */
.fun-link__channel {
  margin-left: auto;
  font-size: 10px;
  letter-spacing: 0.22em;
  color: var(--phosphor);
  opacity: 0.55;
  transform: translateX(-2px);
  transition: opacity 160ms ease, transform 160ms ease;
}

.fun-link:hover .fun-link__channel {
  opacity: 1;
  transform: translateX(0);
}
</style>
