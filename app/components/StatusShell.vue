<script setup lang="ts">
defineOptions({ name: 'StatusShell' })

// Full-screen status page shell — the shared template for "the app can't
// serve you right now" surfaces (error.vue, offline-for-now). It's a thin,
// opinionated skin over ImceIntroShell that pins `standalone` and encodes
// the common inner structure (a message line + an optional hint line) so
// each consumer doesn't reach for the raw `imce__intro-*` classes.
withDefaults(defineProps<{
  title: string
  icon?: string
  iconPulse?: boolean
  message?: string
  hint?: string
  hintVariant?: 'default' | 'warn'
  hintSpinner?: boolean
  showFineprint?: boolean
}>(), {
  icon: 'i-lucide-scan-eye',
  iconPulse: false,
  hintVariant: 'default',
  hintSpinner: false,
  showFineprint: true
})
</script>

<template>
  <ImceIntroShell
    :title="title"
    :icon="icon"
    :icon-pulse="iconPulse"
    :show-fineprint="showFineprint"
    standalone
  >
    <p
      v-if="message || $slots.default"
      class="imce__intro-text"
    >
      <slot>{{ message }}</slot>
    </p>

    <p
      v-if="hint || $slots.hint"
      class="imce__intro-hint"
      :class="{ 'imce__intro-hint--warn': hintVariant === 'warn' }"
    >
      <UIcon
        v-if="hintSpinner"
        name="i-lucide-loader-circle"
        class="imce__intro-spin"
      />
      <slot name="hint">{{ hint }}</slot>
    </p>

    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </ImceIntroShell>
</template>
