<script setup lang="ts">
defineOptions({ name: 'ExploreAboutCard' })
</script>

<template>
  <aside class="about">
    <p class="about__lede">
      A living atlas of open webcams discovered on the public internet —
      browse, filter and watch them live from the edge.
    </p>

    <p class="about__disclaimer">
      Results may include NSFW or sensitive content. Browse at your discretion.
    </p>

    <a
      class="about__author about__author--reddit"
      href="https://reddit.com/r/ipcrawl"
      target="_blank"
      rel="noopener"
    >
      <span class="about__author-name">reddit.com/r/ipcrawl</span>
      <UIcon
        name="i-lucide-arrow-up-right"
        class="about__author-arrow"
      />
    </a>
  <!--
    <a
      class="about__author about__author--github"
      href="https://github.com/alectrocute/ipcrawl"
      target="_blank"
      rel="noopener"
    >
      <span class="about__author-name">github.com/alectrocute/ipcrawl</span>
      <UIcon
        name="i-lucide-arrow-up-right"
        class="about__author-arrow"
      />
    </a> -->
  </aside>
</template>

<style scoped>
.about {
  padding: 16px 18px 14px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  background: var(--glass, rgba(12, 17, 16, 0.55));
}

.about__lede {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-dim, #8b9591);
}

.about__disclaimer {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-mute, #58615d);
}

.about__author {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 13px;
  padding-top: 12px;
  border-top: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  font-size: 12px;
  color: var(--text-dim, #8b9591);
  text-decoration: none;
  transition: color 140ms ease;
}

.about__author:hover {
  color: var(--phosphor);
}

.about__author:focus-visible {
  outline: 2px solid var(--phosphor);
  outline-offset: 2px;
  border-radius: 4px;
}

.about__author:first-of-type {
  margin-top: 13px;
}

.about__author--reddit,
.about__author--github {
  margin-top: 8px;
  padding-top: 0;
  border-top: none;
}

.about__author-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 140ms ease;
}

.about__author:hover .about__author-icon {
  opacity: 1;
}

.about__author-name {
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* The arrow nudges out on hover — a quiet cue that the link leaves the site. */
.about__author-arrow {
  width: 12px;
  height: 12px;
  margin-left: auto;
  opacity: 0.45;
  transition: opacity 140ms ease, transform 140ms ease;
}

.about__author:hover .about__author-arrow {
  opacity: 1;
  transform: translate(1px, -1px);
}
</style>
