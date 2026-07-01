<script setup lang="ts">
import { marked } from 'marked'
import aboutMarkdown from '~/content/about.md?raw'

defineOptions({ name: 'AboutPage' })

// Authored, static content — parsed once at setup (identical on server and
// client, so no hydration drift) and trusted for v-html. External links get
// target/rel so they open away from the catalogue.
const html = (marked.parse(aboutMarkdown, { async: false }) as string)
  .replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"')

const title = 'About — IP Crawl'
const description = 'What IP Crawl is, how it works, and the privacy stance behind the open-webcam atlas.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})
</script>

<template>
  <div class="about-page">
    <div class="about-page__inner">
      <header class="about-page__header">
        <!-- div, not h1 — the article's markdown h1 owns the page heading. -->
        <IpcrawlLogo tag="div" />
        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="sm"
        >
          Back to app
        </UButton>
      </header>

      <article class="prose">
        <!-- Trusted, build-time markdown (authored in app/content/about.md). -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-html="html" />
      </article>
    </div>
  </div>
</template>

<style scoped>
/* The base app pins body to a fixed, non-scrolling surface; this page owns its
   own scroll context (same pattern as the catalogue). */
.about-page {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.about-page__inner {
  max-width: 760px;
  margin: 0 auto;
  padding: clamp(12px, 1.6vw, 18px) clamp(18px, 5vw, 32px) 120px;
  /* Morphs against the catalogue's 1600px shell on route changes. */
  view-transition-name: page-shell;
}

.about-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: clamp(10px, 1.4vw, 14px);
  margin-bottom: clamp(24px, 4vw, 44px);
  border-bottom: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  view-transition-name: page-header;
}

/* Quiet entrance so the article settles in rather than snapping. */
.prose {
  animation: about-rise 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes about-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* --- Prose (rendered markdown) -------------------------------------------- */
.prose :deep(*) {
  margin: 0;
}

.prose :deep(* + *) {
  margin-top: 1.05em;
}

.prose :deep(h1) {
  font-size: clamp(28px, 5vw, 40px);
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.1;
  color: var(--text, #f4f6f5);
}

/* Solid phosphor mark under the title — brand anchor without the gradient fade. */
.prose :deep(h1)::after {
  content: "";
  display: block;
  width: 40px;
  height: 2px;
  margin-top: 22px;
  background: var(--phosphor);
}

.prose :deep(h2) {
  margin-top: 2.2em;
  font-size: clamp(17px, 2.6vw, 21px);
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--text, #f4f6f5);
}

.prose :deep(h3) {
  margin-top: 1.6em;
  font-size: 15px;
  font-weight: 700;
  color: var(--text, #f4f6f5);
}

.prose :deep(p),
.prose :deep(li) {
  font-size: 14.5px;
  line-height: 1.75;
  color: var(--text-dim, #8b9591);
}

.prose :deep(strong) {
  color: var(--text, #f4f6f5);
  font-weight: 700;
}

.prose :deep(a) {
  color: var(--phosphor);
  text-decoration: none;
  border-bottom: 1px solid var(--phosphor-soft);
  transition: color 140ms ease, border-color 140ms ease;
}

.prose :deep(a:hover) {
  color: var(--phosphor-bright);
  border-bottom-color: var(--phosphor-bright);
}

.prose :deep(a:focus-visible) {
  outline: 2px solid var(--phosphor);
  outline-offset: 3px;
  border-radius: 3px;
}

.prose :deep(ul),
.prose :deep(ol) {
  padding-left: 0;
  list-style: none;
}

.prose :deep(li) {
  position: relative;
  padding-left: 26px;
}

.prose :deep(li + li) {
  margin-top: 0.5em;
}

/* Custom phosphor bullet for unordered lists. */
.prose :deep(ul > li)::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 0.72em;
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: var(--phosphor);
}

.prose :deep(blockquote) {
  padding: 16px 20px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-left: 3px solid var(--phosphor);
  border-radius: 0 12px 12px 0;
  background: var(--glass, rgba(12, 17, 16, 0.55));
}

.prose :deep(blockquote p) {
  color: var(--text, #f4f6f5);
}

.prose :deep(code) {
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 0.9em;
  color: var(--phosphor-bright);
  background: rgb(var(--phosphor-rgb) / 0.1);
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
}

.prose :deep(hr) {
  margin-top: 2.4em;
  border: none;
  height: 1px;
  background: var(--hairline, rgba(255, 255, 255, 0.08));
}

/* The closing credit line after the final rule reads as a quiet footer. */
.prose :deep(hr + p) {
  font-size: 13px;
  color: var(--text-mute, #58615d);
}
</style>
