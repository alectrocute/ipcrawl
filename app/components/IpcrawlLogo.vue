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
      <!-- Radar mark, same glyph as public/favicon.svg so the browser tab and
           the page header read as one brand. Inline SVG (not the old PNG) so
           it stays crisp at 19px, themes via currentColor, and can carry a
           slow sweep. Decorative: the link's aria-label (or the wordmark
           text) names it for AT. -->
      <svg
        v-if="variant === 'full'"
        class="logo__mark"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <!-- Outer ring: two arcs leaving cardinal gaps -->
        <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
        <path d="M2.29 9.62a10 10 0 1 0 19.02-1.27" />
        <!-- Middle ring: two arcs with a top gap -->
        <path d="M16.24 7.76a6 6 0 1 0-8.01 8.91" />
        <path d="M17.98 11.66a6 6 0 0 1-2.22 5.01" />
        <!-- Static contact blips -->
        <path d="M4 6h.01" />
        <path d="M12 18h.01" />
        <!-- Center dot -->
        <circle
          cx="12"
          cy="12"
          r="2"
        />
        <!-- Rotating sweep: faint phosphor wash + bright leading edge -->
        <g class="logo__sweep">
          <path
            class="logo__sweep-wedge"
            d="M12 12 L12 2 A10 10 0 0 1 19.07 4.93 Z"
          />
          <line
            class="logo__sweep-line"
            x1="12"
            y1="12"
            x2="19.07"
            y2="4.93"
          />
        </g>
      </svg>
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
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  /* Faint phosphor bloom so the radar reads as "lit" against the dark studio
     rather than a flat line drawing. */
  filter: drop-shadow(0 0 3px rgb(var(--phosphor-rgb) / 0.4));
}

/* Faint phosphor wash that trails the leading edge. */
.logo__sweep-wedge {
  fill: currentColor;
  fill-opacity: 0.14;
  stroke: none;
}

/* Bright leading edge of the sweep — the active beam. */
.logo__sweep-line {
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-opacity: 0.95;
}

/* Slow radar sweep around the viewBox center. The global
   prefers-reduced-motion rule in main.css clamps this to a static frame. */
.logo__sweep {
  transform-box: view-box;
  transform-origin: 12px 12px;
  animation: logo-radar-sweep 6s linear infinite;
}

@keyframes logo-radar-sweep {
  to { transform: rotate(360deg); }
}

.logo__ip {
  color: var(--text, #f4f6f5);
}

.logo__crawl {
  color: var(--phosphor);
}

/* Flat enamel chip: a quiet phosphor-tinted status pill. Replaces the prior
   tilted, glossy 3D badge — modern flat treatment that reads as an indicator
   rather than a sticker. */
.logo__beta {
  margin-left: 2px;
  padding: 2px 5px 1px;
  border: 1px solid color-mix(in oklab, var(--phosphor), transparent 58%);
  border-radius: 4px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-indent: 0.18em;
  color: var(--phosphor-bright);
  background: rgb(var(--phosphor-rgb) / 0.10);
  align-self: center;
}
</style>
