<script setup lang="ts">
import type { CheckMyIpResponse } from '#shared/checkMyIp'
import { API_IP } from '#shared/routes'

defineOptions({ name: 'ApiPage' })

const title = 'API — IP Crawl'
const description = 'The public IP Crawl API: a single CORS-open endpoint that reports whether the requesting IP appears in the open-webcam catalog.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})

// Live "try it" panel — calls the endpoint from the browser and shows the
// raw JSON. Defaults to the browser's normal cache semantics so repeat clicks
// within the 5-min window reuse the same cached answer — the `checkedAt`
// timestamp + age badge make that visible. The "bypass cache" toggle forces
// a fresh origin hit for users who want to re-check.
// The exposure-check API lives on the IMCE marketing domain
// (ismycameraexposed.com) — same Nitro origin, but that host is the
// consumer-facing brand for the "is my camera exposed?" feature, so the
// public URL shown here points at it rather than the ipcrawl.com shell.
// `imceDomain` is the bare host (no protocol); fall back to the canonical
// documented domain when the env var isn't set (e.g. local dev).
const configuredImceDomain = useRuntimeConfig().public.imceDomain
const imceDomain = configuredImceDomain || 'ismycameraexposed.com'
const sampleOrigin = `https://${imceDomain}`
const sampleUrl = `${sampleOrigin}${API_IP}`

// The endpoint 404s on any host other than the IMCE domain (see
// server/api/ip.get.ts), so in prod the try-it button must call the absolute
// IMCE URL cross-origin (CORS-* permits it). In dev the env var is unset and
// the host gate is a no-op, so the relative path against localhost works and
// we avoid a cross-origin hop to the real production server.
const fetchUrl = configuredImceDomain ? sampleUrl : API_IP

const curlExample = `curl ${sampleUrl}`
const fetchExample = `// Hourly exposure monitor — alert me if my public IP shows up in the
// IP Crawl catalog. A flip from found:false → true means a webcam on
// my network just got exposed to the public internet (default creds on
// a new device, a misconfigured firewall, a forgotten port forward).
// Catching it within the hour means I can secure the camera before
// every other scanner on the internet indexes it.
const URL = '${sampleUrl}'
const HOUR_MS = 60 * 60 * 1000

let known = null  // previous \`found\` value — only fire on a change

async function check() {
  const res = await fetch(URL, { cache: 'default' })
  if (!res.ok) return  // network or server hiccup — try again next hour

  const { found, ip, checkedAt } = await res.json()

  if (Date.now() - checkedAt > 60_000) return

  if (found !== known) {
    if (found) console.warn(\`[ipcrawl] \${ip} just appeared in the catalog\`)
    else       console.log(\`[ipcrawl] \${ip} is no longer listed\`)
    known = found
  }
}

check()                      // run once immediately...
setInterval(check, HOUR_MS)  // ...then every hour`

const result = ref<CheckMyIpResponse | null>(null)
const resultError = ref<string | null>(null)
const loading = ref(false)
const resultRaw = ref<string>('')
// Wall-clock at the moment the response landed, used to age `checkedAt` and
// flag a cached vs fresh answer. Captured client-side only.
const receivedAt = ref<number | null>(null)
const bypassCache = ref(false)

// Anything older than ~2s when it lands was served from the browser cache
// rather than just fetched from origin. Tuned wide enough that network
// latency on a real origin hit doesn't read as "cached".
const FRESH_THRESHOLD_MS = 2000

const ageMs = computed(() => {
  if (!result.value || !receivedAt.value) return null
  return Math.max(0, receivedAt.value - result.value.checkedAt)
})

const isCached = computed(() => ageMs.value !== null && ageMs.value >= FRESH_THRESHOLD_MS)

const checkedAtLabel = computed(() => {
  const ts = result.value?.checkedAt
  if (!ts) return null
  return `${new Date(ts).toISOString().replace('T', ' ').slice(0, 19)} UTC`
})

const ageLabel = computed(() => {
  const ms = ageMs.value
  if (ms === null) return null
  if (ms < 1000) return `${ms}ms ago`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s ago`
})

async function runCheck() {
  loading.value = true
  resultError.value = null
  try {
    const data = await $fetch<CheckMyIpResponse>(fetchUrl, {
      cache: bypassCache.value ? 'no-cache' : 'default'
    })
    result.value = data
    resultRaw.value = JSON.stringify(data, null, 2)
    receivedAt.value = Date.now()
  } catch (err) {
    result.value = null
    resultRaw.value = ''
    receivedAt.value = null
    resultError.value = err instanceof Error ? err.message : 'Request failed.'
  } finally {
    loading.value = false
  }
}

// Copy-to-clipboard for the code samples. Falls back to a no-op on browsers
// without the async clipboard API (older Safari, etc.).
const copiedKey = ref<string | null>(null)
async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedKey.value = key
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null
    }, 1400)
  } catch {
    // Silently ignore — the user can still select-and-copy manually.
  }
}
</script>

<template>
  <div class="api-page">
    <div class="api-page__inner">
      <header class="api-page__header">
        <!-- div, not h1 — "API" below owns the page heading. -->
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

      <main class="api-body">
        <h1 class="api-title">
          API
        </h1>
        <p class="api-subtitle">
          Check if your public IP address is associated with a webcam in IP Crawl's catalog.
        </p>

        <!-- Endpoint card -->
        <section class="api-card">
          <div class="api-card__head">
            <code class="api-path">{{ sampleUrl }}</code>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :icon="copiedKey === 'url' ? 'i-lucide-check' : 'i-lucide-copy'"
              :title="copiedKey === 'url' ? 'Copied' : 'Copy endpoint URL'"
              :aria-label="copiedKey === 'url' ? 'Copied' : 'Copy endpoint URL'"
              class="api-card__copy"
              @click="copy(sampleUrl, 'url')"
            >
              {{ copiedKey === 'url' ? 'Copied' : 'Copy' }}
            </UButton>
          </div>

          <div class="api-response">
            <div class="api-response__head">
              <span class="api-response__title">Response</span>
              <span class="api-response__status">
                <code>200 OK</code> · <code>application/json</code>
              </span>
            </div>

            <dl class="api-fields">
              <div class="api-field">
                <dt class="api-field__head">
                  <code class="api-field__name">found</code>
                  <span class="api-field__type">boolean</span>
                </dt>
                <dd class="api-field__desc">
                  <code>true</code> if the requesting IP matches at least one
                  row in the catalog, <code>false</code> otherwise — including
                  when no IP could be resolved or the DB is cold (the endpoint
                  degrades to "not found" rather than 500ing).
                </dd>
              </div>
              <div class="api-field">
                <dt class="api-field__head">
                  <code class="api-field__name">ip</code>
                  <span class="api-field__type">string</span>
                </dt>
                <dd class="api-field__desc">
                  The IP resolved from <code>cf-connecting-ip</code> (then
                  <code>x-forwarded-for</code>), echoed back so a caller can
                  confirm which address was checked. <code>"unknown"</code> when
                  no forwarded IP is present.
                </dd>
              </div>
              <div class="api-field">
                <dt class="api-field__head">
                  <code class="api-field__name">checkedAt</code>
                  <span class="api-field__type">number</span>
                </dt>
                <dd class="api-field__desc">
                  Server epoch-ms clock at the moment the lookup ran. Compare to
                  <code>Date.now()</code> to detect a cached answer: near-zero
                  is a fresh origin hit, up to ~300000ms (5 min) is the browser
                  cache serving the prior answer.
                </dd>
              </div>
            </dl>

            <div class="api-response__sample">
              <span class="api-response__sample-label">Example response</span>
              <pre class="api-response__sample-code"><code>{
  "found": false,
  "ip": "203.0.113.42",
  "checkedAt": 1783104000000
}</code></pre>
            </div>
          </div>

          <div class="api-card__try">
            <div class="api-card__try-controls">
              <UButton
                :loading="loading"
                color="primary"
                variant="solid"
                size="md"
                @click="runCheck"
              >
                Check my IP
              </UButton>
              <USwitch
                v-model="bypassCache"
                size="sm"
                label="Bypass cache"
                :help="bypassCache ? 'Sending Cache-Control: no-cache — fresh origin hit' : 'Respecting browser cache — repeat clicks reuse the cached answer'"
              />
            </div>
            <div
              v-if="result || resultError"
              class="api-result"
              :class="resultError ? 'api-result--error' : (result?.found ? 'api-result--found' : 'api-result--clear')"
            >
              <div class="api-result__head">
                <UIcon
                  v-if="resultError"
                  name="i-lucide-triangle-alert"
                  class="api-result__icon"
                />
                <UIcon
                  v-else-if="result?.found"
                  name="i-lucide-shield-alert"
                  class="api-result__icon"
                />
                <UIcon
                  v-else
                  name="i-lucide-shield-check"
                  class="api-result__icon"
                />
                <span class="api-result__label">
                  <template v-if="resultError">{{ resultError }}</template>
                  <template v-else-if="result?.found">
                    Your IP <code :title="result.ip">{{ result.ip }}</code> appears in the catalog.
                  </template>
                  <template v-else>
                    Your IP <code :title="result?.ip ?? 'unknown'">{{ result?.ip ?? 'unknown' }}</code> is not in the catalog.
                  </template>
                </span>
                <span
                  v-if="result && !resultError"
                  class="api-result__badge"
                  :class="isCached ? 'api-result__badge--cached' : 'api-result__badge--fresh'"
                >
                  <span
                    class="api-result__badge-dot"
                    aria-hidden="true"
                  />
                  {{ isCached ? 'Cached' : 'Fresh' }}
                </span>
              </div>
              <dl
                v-if="result && !resultError"
                class="api-result__meta"
              >
                <div class="api-result__meta-row">
                  <dt>checkedAt</dt>
                  <dd>
                    <code>{{ result.checkedAt }}</code>
                    <span
                      v-if="checkedAtLabel"
                      class="api-result__meta-pretty"
                    >{{ checkedAtLabel }}</span>
                  </dd>
                </div>
                <div
                  v-if="ageLabel"
                  class="api-result__meta-row"
                >
                  <dt>age</dt>
                  <dd>{{ ageLabel }}</dd>
                </div>
              </dl>
              <pre
                v-if="resultRaw"
                class="api-result__raw"
              ><code>{{ resultRaw }}</code></pre>
            </div>
          </div>
        </section>

        <!-- Examples -->
        <section class="api-section">
          <h2 class="api-section__title">
            Examples
          </h2>

          <div class="api-samples">
            <div class="api-sample">
              <header class="api-sample__head">
                <span class="api-sample__lang">cURL</span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="copiedKey === 'curl' ? 'i-lucide-check' : 'i-lucide-copy'"
                  @click="copy(curlExample, 'curl')"
                >
                  {{ copiedKey === 'curl' ? 'Copied' : 'Copy' }}
                </UButton>
              </header>
              <pre class="api-code"><code>{{ curlExample }}</code></pre>
            </div>

            <div class="api-sample">
              <header class="api-sample__head">
                <span class="api-sample__lang">JavaScript · Node.js</span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="copiedKey === 'fetch' ? 'i-lucide-check' : 'i-lucide-copy'"
                  @click="copy(fetchExample, 'fetch')"
                >
                  {{ copiedKey === 'fetch' ? 'Copied' : 'Copy' }}
                </UButton>
              </header>
              <pre class="api-code"><code>{{ fetchExample }}</code></pre>
            </div>
          </div>
        </section>

        <!-- Notes -->
        <section class="api-section">
          <h2 class="api-section__title">
            Notes
          </h2>
          <ul class="api-notes">
            <li>NOTE: I reserve the right to ban your access from IP Crawl's API at any moment for any reason.</li>
            <li>I'm planning to build out this API further, so make sure to check back for updates.</li>
          </ul>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* Same scroll-ownership pattern as /about and /stats — the base app pins body
   to a fixed non-scrolling surface, so this page owns its own scroll context. */
.api-page {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.api-page__inner {
  max-width: 820px;
  margin: 0 auto;
  padding: clamp(12px, 1.6vw, 18px) clamp(18px, 5vw, 32px) 120px;
  view-transition-name: page-shell;
}

.api-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: clamp(10px, 1.4vw, 14px);
  margin-bottom: clamp(24px, 4vw, 44px);
  border-bottom: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  view-transition-name: page-header;
}

.api-body {
  animation: api-rise 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes api-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.api-title {
  margin: 0;
  font-size: clamp(28px, 5vw, 40px);
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.1;
  color: var(--text, #f4f6f5);
}

.api-title::after {
  content: "";
  display: block;
  width: 40px;
  height: 2px;
  margin-top: 22px;
  background: var(--phosphor);
}

.api-subtitle {
  margin: 18px 0 0;
  max-width: 60ch;
  font-size: 14.5px;
  line-height: 1.75;
  color: var(--text-dim, #8b9591);
}

/* --- Endpoint card ------------------------------------------------------- */
.api-card {
  margin-top: clamp(28px, 4vw, 40px);
  padding: clamp(18px, 2.6vw, 26px);
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgb(var(--phosphor-rgb) / 0.045) 0%, transparent 45%),
    var(--glass, rgba(12, 17, 16, 0.55));
}

.api-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.api-method {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--phosphor-ink);
  background: linear-gradient(180deg, color-mix(in oklab, var(--phosphor), white 35%) 0%, var(--phosphor) 100%);
}

.api-path {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 13.5px;
  color: var(--text, #f4f6f5);
  word-break: break-all;
}

/* Pinned to the right edge of the head row; the path code fills the space
   before it and wraps rather than pushing the button around. */
.api-card__copy {
  flex-shrink: 0;
  white-space: nowrap;
}

.api-response {
  margin: 18px 0 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.api-response__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.api-response__title {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-mute, #58615d);
}

.api-response__status {
  font-size: 12px;
  color: var(--text-dim, #8b9591);
}

.api-response__status code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--phosphor-bright);
  background: rgb(var(--phosphor-rgb) / 0.08);
  padding: 1px 5px;
  border-radius: 4px;
}

.api-fields {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.api-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 0;
  border-top: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
}

.api-field__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.api-field__name {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--phosphor-bright);
  background: rgb(var(--phosphor-rgb) / 0.08);
  padding: 1px 6px;
  border-radius: 4px;
}

.api-field__type {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-mute, #58615d);
}

.api-field__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-dim, #8b9591);
}

.api-field__desc code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--phosphor-bright);
  background: rgb(var(--phosphor-rgb) / 0.08);
  padding: 1px 5px;
  border-radius: 4px;
}

.api-response__sample {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.api-response__sample-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-mute, #58615d);
}

.api-response__sample-code {
  margin: 0;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  background: var(--bg-1, #070a09);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text, #f4f6f5);
  overflow-x: auto;
  white-space: pre;
}

.api-response__sample-code code {
  font-family: inherit;
}

.api-card__try {
  margin-top: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.api-card__try-controls {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}

.api-result {
  padding: 14px 16px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  background: var(--glass-strong, rgba(7, 11, 10, 0.82));
}

.api-result--found {
  border-color: var(--imce-alert-soft, rgba(255, 138, 76, 0.55));
}

.api-result--clear {
  border-color: var(--phosphor-soft);
}

.api-result--error {
  border-color: var(--imce-alert-soft, rgba(255, 138, 76, 0.55));
}

.api-result__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.api-result__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.api-result--clear .api-result__icon { color: var(--phosphor-bright); }
.api-result--found .api-result__icon,
.api-result--error .api-result__icon { color: var(--imce-alert-bright, #ffb088); }

.api-result__label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13.5px;
  color: var(--text, #f4f6f5);
  line-height: 1.5;
}

/* Fresh/cached pill — sits at the right edge of the result head so the age
   signal is the first thing the eye lands on after a click. */
.api-result__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
}

.api-result__badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.api-result__badge--fresh {
  color: var(--phosphor-bright);
  border-color: var(--phosphor-soft);
  background: rgb(var(--phosphor-rgb) / 0.08);
}

.api-result__badge--fresh .api-result__badge-dot {
  background: var(--phosphor);
  box-shadow: 0 0 6px var(--phosphor-glow);
}

.api-result__badge--cached {
  color: var(--text-dim, #8b9591);
  background: rgb(255 255 255 / 0.03);
}

.api-result__badge--cached .api-result__badge-dot {
  background: var(--text-mute, #58615d);
}

/* checkedAt + age metadata, slotted between the headline and the raw JSON. */
.api-result__meta {
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.api-result__meta-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0;
}

.api-result__meta-row dt {
  flex-shrink: 0;
  min-width: 76px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-mute, #58615d);
}

.api-result__meta-row dd {
  margin: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--text-dim, #8b9591);
}

.api-result__meta-row code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--phosphor-bright);
  background: rgb(var(--phosphor-rgb) / 0.08);
  padding: 1px 5px;
  border-radius: 4px;
}

.api-result__meta-pretty {
  font-size: 11.5px;
  color: var(--text-mute, #58615d);
}

.api-result__label code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--phosphor-bright);
  background: rgb(var(--phosphor-rgb) / 0.08);
  padding: 1px 5px;
  border-radius: 4px;
  /* A full IPv6 can hit 39 chars and would blow out the result row inline.
     Truncate with ellipsis; the full address is preserved in the title
     attribute (hover) and in the raw JSON block below. `min(22ch, 100%)`
     caps at 22 chars on wide viewports and at the flex item's width on
     narrow ones so the chip never overflows its row. */
  display: inline-block;
  max-width: min(22ch, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.api-result__raw {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  background: var(--bg-1, #070a09);
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-dim, #8b9591);
  overflow-x: auto;
}

.api-result__raw code {
  font-family: inherit;
  white-space: pre;
}

/* --- Sections ----------------------------------------------------------- */
.api-section {
  margin-top: clamp(30px, 4.4vw, 48px);
  min-width: 0;
}

.api-section__title {
  margin: 0 0 14px;
  font-size: clamp(15px, 2.2vw, 18px);
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--text, #f4f6f5);
}

.api-samples {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.api-sample {
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  background: var(--glass, rgba(12, 17, 16, 0.55));
  overflow: hidden;
}

.api-sample__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  background: rgb(var(--phosphor-rgb) / 0.03);
}

.api-sample__lang {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-mute, #58615d);
}

.api-code {
  margin: 0;
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text, #f4f6f5);
  overflow-x: auto;
  white-space: pre;
}

.api-code code {
  font-family: inherit;
}

.api-code--response {
  color: var(--phosphor-bright);
}

.api-notes {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.api-notes li {
  position: relative;
  padding-left: 22px;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text-dim, #8b9591);
}

.api-notes li::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 0.65em;
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: var(--phosphor);
}

.api-notes code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--phosphor-bright);
  background: rgb(var(--phosphor-rgb) / 0.08);
  padding: 1px 5px;
  border-radius: 4px;
}

@media (max-width: 620px) {
  .api-response__sample-code {
    font-size: 11.5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .api-body {
    animation: none;
  }
}
</style>
