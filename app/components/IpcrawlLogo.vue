<script setup lang="ts">
defineOptions({ name: 'IpcrawlLogo' })

// One logo, every surface. Lives in the root layer so the explore and fun
// layers both pick it up via auto-import.
//
//   variant 'full'      — radar mark + IP CRAWL + BETA pin (page headers)
//   variant 'wordmark'  — wide-tracked IPCRAWL lockup for embedding in
//                         controls (e.g. the fun-mode info pill)
//
// `tag` keeps heading semantics in the page's hands: the catalogue header is
// the page h1, while about/stats (which have their own h1) embed it as a div
// and fun mode nests it in a button as a span.
const props = withDefaults(defineProps<{
  tag?: 'h1' | 'div' | 'span'
  /** Wrap in a link to "/" — a full reset of the explorer's URL state. */
  link?: boolean
  variant?: 'full' | 'wordmark'
}>(), {
  tag: 'h1',
  link: true,
  variant: 'full'
})

const NuxtLink = resolveComponent('NuxtLink')
const inner = computed(() => (props.link ? NuxtLink : 'span'))
</script>

<template>
  <component
    :is="tag"
    class="logo"
    :class="`logo--${variant}`"
  >
    <!-- Every piece of explorer state (filters, page, ?cam= dialog) lives in
         the query string, so a bare "/" link is a full reset to the default
         view. -->
    <component
      :is="inner"
      class="logo__inner"
      v-bind="link ? { 'to': '/', 'aria-label': 'IP Crawl — reset to default view' } : {}"
    >
      <UIcon
        v-if="variant === 'full'"
        name="i-lucide-radar"
        class="logo__mark"
      />
      <span class="logo__ip">IP</span>
      <span class="logo__crawl">CRAWL</span>
      <span
        v-if="variant === 'full'"
        class="logo__beta"
      >BETA</span>
    </component>
  </component>
</template>

<style scoped>
.logo {
  display: inline-flex;
  margin: 0;
  /* The wordmark is part of the brand mark — keep it in the mono face even
     though the rest of the UI now reads in the humanist sans. */
  font-family: var(--font-mono);
  font-weight: 700;
  line-height: 1;
  /* Shared-element morph: the logo sits in a different spot on every page
     (page headers, the fun-mode pill), so route changes glide it between
     positions. Choreography lives in main.css. */
  view-transition-name: brand;
}

.logo--full {
  font-size: 17px;
  letter-spacing: 0.08em;
}

/* Compact lockup tuned for embedding in small controls. */
.logo--wordmark {
  font-size: 12px;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
}

.logo__inner {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: inherit;
  text-decoration: none;
}

.logo--wordmark .logo__inner {
  gap: 0;
}

.logo__inner:is(a):focus-visible {
  outline: 2px solid var(--phosphor);
  outline-offset: 3px;
  border-radius: 6px;
}

.logo__mark {
  width: 19px;
  height: 19px;
  color: var(--phosphor);
}

.logo__ip {
  color: var(--text, #f4f6f5);
}

.logo__crawl {
  color: var(--phosphor);
}

/* Flat enamel chip: a tinted gradient face tilted back slightly in perspective
   like a sticker slapped on the wordmark. */
.logo__beta {
  position: relative;
  align-self: flex-start;
  margin-left: -1px;
  padding: 3px 5px 2px;
  border-radius: 5px;
  overflow: hidden;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-indent: 0.16em;
  color: var(--phosphor-ink);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.25);
  background: linear-gradient(180deg, color-mix(in oklab, var(--phosphor), white 55%) 0%, var(--phosphor) 48%, color-mix(in oklab, var(--phosphor), black 30%) 100%);
  transform: perspective(60px) rotateX(14deg) rotate(-4deg);
  transform-origin: bottom left;
}

/* Recurring glossy glint sweeping across the face. */
.logo__beta::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    115deg,
    transparent 32%,
    rgba(255, 255, 255, 0.75) 48%,
    transparent 64%
  );
  transform: translateX(-130%);
  animation: logo-beta-glint 5s ease-in-out infinite;
}

@keyframes logo-beta-glint {
  0%, 72% { transform: translateX(-130%); }
  88%, 100% { transform: translateX(130%); }
}
</style>
