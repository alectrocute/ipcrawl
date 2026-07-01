<script setup lang="ts">
interface Props {
  total?: number | null
}

defineProps<Props>()

const open = ref(false)
</script>

<template>
  <aside
    class="info"
    :class="{ 'info--open': open }"
  >
    <Transition name="info-button">
      <button
        v-if="!open"
        class="info__toggle"
        type="button"
        :aria-expanded="open"
        @click="open = true"
        @mouseover="open = true"
      >
        <span
          class="info__live"
          aria-hidden="true"
        />
        <IpcrawlLogo
          tag="span"
          :link="false"
          variant="wordmark"
        />
      </button>
    </Transition>

    <Transition name="info-fade">
      <div
        v-if="open"
        class="info__panel"
        @mouseleave="open = false"
      >
        <p>
          Surf the public internet's accidentally-open webcams.
          <span class="info__hl">Hit <em>Next</em> to drop into a fresh snapshot from somewhere on Earth.</span>
        </p>

        <p>
          Expect weirdness: feeds may be live, cached, frozen,
          mislabeled, honeypots, loops, or running on the wrong timestamp.
        </p>

        <p class="info__foot">
          <span v-if="total">{{ total }} channels online · </span>
          <span>powered by <a
            href="https://ipcrawl.com"
          >ipcrawl.com</a></span>
        </p>
      </div>
    </Transition>
  </aside>
</template>

<style scoped>
.info {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 9999;
  font-family: var(--font-mono);
  color: var(--text);
  max-width: min(560px, 92vw);
  width: max-content;
}

.info__toggle {
  appearance: none;
  background: var(--glass-strong);
  backdrop-filter: blur(14px) saturate(1.2);
  border: 1px solid var(--hairline);
  border-radius: 999px;
  color: var(--text-dim);
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.25em;
  padding: 0.6em 1.1em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.7em;
  text-transform: uppercase;
  transition: color 160ms ease, border-color 160ms ease;
  margin: 0 auto;
}

.info__toggle:hover {
  color: var(--text);
  border-color: var(--hairline-strong);
}

/* The "ON AIR" tally light. */
.info__live {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--phosphor-bright);
  animation: pulse 1.8s ease-in-out infinite;
  flex: 0 0 auto;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.info__panel {
  margin-top: 10px;
  background: var(--glass-strong);
  backdrop-filter: blur(18px) saturate(1.2);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  padding: 20px 22px;
  font-size: 13px;
  line-height: 1.6;
  color: #c7d0cc;
}

.info__title {
  margin: 0 0 10px;
}

.info__panel p {
  margin: 0 0 8px;
}

.info__panel p:last-child {
  margin-bottom: 0;
}

.info__hl {
  color: var(--stumble-fg);
}

.info__panel a {
  color: var(--stumble-accent);
  text-decoration: underline;
  text-decoration-color: rgb(var(--phosphor-rgb) / 0.4);
  text-underline-offset: 3px;
}

.info__foot {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
  font-size: 11px;
  color: var(--stumble-dim);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.info-fade-enter-active,
.info-fade-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.info-fade-enter-from,
.info-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.info-button-enter-active,
.info-button-leave-active {
  transition: all 200ms ease;
}

.info-button-enter-from {
  opacity: 0;
  transition: none;
}

.info-button-enter-to {
  transition-delay: 200ms;
  opacity: 1;
}

.info-button-leave-from {
  opacity: 0;
}

.info-button-leave-to {
  opacity: 0;
}
</style>
