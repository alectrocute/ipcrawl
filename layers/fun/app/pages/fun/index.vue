<script setup lang="ts">
import { API_CAM, funChannelPath } from '#shared/routes'

/**
 * Picks a random cam and redirects to /fun/c/<id>. On SSR this becomes a 302,
 * which CDNs/browsers handle natively — every visitor lands on a shareable
 * channel URL without ever rendering this page.
 *
 * useRequestFetch (not bare $fetch) so the SSR sub-request forwards the
 * visitor's history cookie — otherwise the recent-channel dedupe never
 * applies to landings on `/`.
 */
const requestFetch = useRequestFetch()
const cam = await requestFetch<{ id: string }>(API_CAM).catch(() => null)

if (cam?.id) {
  await navigateTo(funChannelPath(cam.id), { replace: true })
} else {
  throw createError({
    statusCode: 503,
    statusMessage: 'Channels are warming up. Refresh in a moment.'
  })
}
</script>

<template>
  <div />
</template>
