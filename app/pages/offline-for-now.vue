<script setup lang="ts">
defineOptions({ name: 'OfflineForNowPage' })

useSeoMeta({
  title: 'Temporarily offline — IP Crawl',
  description: 'IP Crawl is temporarily overloaded. We will be back online as soon as we can.',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <ImceIntroShell
    title="We're temporarily offline"
    icon="i-lucide-construction"
    standalone
  >
    <p class="imce__intro-text">
      We're temporarily overloaded and had to pause the crawler.
      We'll be back online as soon as we can. Thank you for your patience!
    </p>
    <p class="imce__intro-hint imce__intro-hint--warn">
      <UIcon
        name="i-lucide-loader-circle"
        class="imce__intro-spin"
      />
      Standing by to restore service…
    </p>
  </ImceIntroShell>
</template>
