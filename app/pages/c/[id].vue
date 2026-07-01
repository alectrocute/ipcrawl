<script setup lang="ts">
import { funChannelPath } from '#shared/routes'

const route = useRoute()
const id = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id

await navigateTo(funChannelPath(id || ''), {
  redirectCode: 301,
  replace: true
})
</script>

<template>
  <div />
</template>
