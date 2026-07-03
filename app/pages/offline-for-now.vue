<script setup lang="ts">
defineOptions({ name: 'OfflineForNowPage' })

useSeoMeta({
  title: 'Temporarily offline — IP Crawl',
  description: 'IP Crawl is temporarily overloaded. We will be back online as soon as we can.',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <StatusShell
    title="We're temporarily offline"
    icon="i-lucide-construction"
    message="We're temporarily overloaded and had to pause the crawler. We'll be back online as soon as we can. Thank you for your patience!"
    hint="Standing by to restore service…"
    hint-variant="warn"
    hint-spinner
  />
</template>
