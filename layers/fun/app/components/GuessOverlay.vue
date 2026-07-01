<script setup lang="ts">
defineOptions({ name: 'GuessOverlay' })

interface Props {
  loading?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<{
  (e: 'next-round' | 'restart' | 'exit' | 'exit-game'): void
}>()

const game = useGuessGame()
const {
  phase,
  round,
  guess,
  results,
  lastResult,
  totalRounds,
  maxScore,
  totalScore,
  targetReady,
  isFinalRound
} = game

function onPlace(payload: { lat: number, lon: number }) {
  game.placePin(payload.lat, payload.lon)
}

function onPrimary() {
  if (phase.value === 'guessing') {
    if (guess.value) game.submit()
    return
  }
  if (phase.value === 'revealed') {
    emit('next-round')
  }
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString()} km`
}

const scorePct = computed(() => Math.round((totalScore.value / maxScore) * 100))

const grade = computed(() => {
  const p = scorePct.value
  if (p >= 90) return 'CARTOGRAPHER'
  if (p >= 70) return 'GLOBETROTTER'
  if (p >= 50) return 'NAVIGATOR'
  if (p >= 30) return 'TOURIST'
  return 'LOST SOUL'
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('exit')
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (phase.value === 'summary') emit('restart')
    else onPrimary()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="guess-overlay">
    <div class="guess-overlay__backdrop" />

    <div class="guess-overlay__card">
      <header class="guess-overlay__header">
        <div class="guess-overlay__title">
          <span class="guess-overlay__badge">GUESS GAME</span>
          <span
            v-if="phase !== 'summary'"
            class="guess-overlay__round"
          >ROUND {{ round }} / {{ totalRounds }}</span>
        </div>
        <div class="guess-overlay__score">
          <span class="guess-overlay__score-num">{{ totalScore.toLocaleString() }}</span>
          <span class="guess-overlay__score-label">PTS</span>
        </div>
        <button
          type="button"
          class="guess-overlay__close"
          aria-label="Close map"
          @click="emit('exit')"
        >
          &times;
        </button>
      </header>

      <!-- ROUND VIEW: map + (during reveal) result readout -->
      <template v-if="phase !== 'summary'">
        <div class="guess-overlay__map">
          <div class="guess-overlay__mapbox">
            <GuessMap
              :guess="guess"
              :actual="lastResult ? { lat: lastResult.actualLat, lon: lastResult.actualLon } : null"
              :revealed="phase === 'revealed'"
              :interactive="phase === 'guessing'"
              @place="onPlace"
            />
          </div>
        </div>

        <footer class="guess-overlay__footer">
          <button
            type="button"
            class="guess-overlay__exit-game"
            @click="emit('exit-game')"
          >
            EXIT GAME
          </button>
          <Transition
            name="guess-fade"
            mode="out-in"
          >
            <div
              v-if="phase === 'guessing'"
              key="guessing"
              class="guess-overlay__hint"
            >
              <template v-if="!targetReady">
                Tuning a mystery channel&hellip;
              </template>
              <template v-else-if="!guess">
                Study the feed, then click the map to drop your pin.
              </template>
              <template v-else>
                Pin dropped. Adjust it, or lock in your guess.
              </template>
            </div>

            <div
              v-else-if="lastResult"
              key="revealed"
              class="guess-overlay__result"
            >
              <div class="guess-overlay__result-main">
                <span class="guess-overlay__points">+{{ lastResult.points.toLocaleString() }}</span>
                <span class="guess-overlay__dist">{{ formatDistance(lastResult.distanceKm) }} away</span>
              </div>
              <div class="guess-overlay__loc">
                {{ lastResult.location || 'Unknown location' }}
              </div>
            </div>
          </Transition>

          <button
            type="button"
            class="guess-overlay__primary"
            :disabled="(phase === 'guessing' && (!guess || !targetReady)) || props.loading"
            @click="onPrimary"
          >
            <template v-if="phase === 'guessing'">
              LOCK IN GUESS
            </template>
            <template v-else-if="isFinalRound">
              SEE FINAL SCORE
            </template>
            <template v-else>
              NEXT ROUND
            </template>
            <kbd class="guess-overlay__kbd">ENTER</kbd>
          </button>
        </footer>
      </template>

      <!-- SUMMARY VIEW -->
      <template v-else>
        <div class="guess-overlay__summary">
          <div class="guess-overlay__summary-head">
            <span class="guess-overlay__grade">{{ grade }}</span>
            <div class="guess-overlay__final">
              <span class="guess-overlay__final-num">{{ totalScore.toLocaleString() }}</span>
              <span class="guess-overlay__final-max">/ {{ maxScore.toLocaleString() }}</span>
            </div>
            <span class="guess-overlay__final-pct">{{ scorePct }}% accuracy</span>
          </div>

          <ol class="guess-overlay__rounds">
            <li
              v-for="(r, i) in results"
              :key="i"
            >
              <span class="guess-overlay__rounds-n">{{ i + 1 }}</span>
              <span class="guess-overlay__rounds-loc">{{ r.location || 'Unknown' }}</span>
              <span class="guess-overlay__rounds-dist">{{ formatDistance(r.distanceKm) }}</span>
              <span class="guess-overlay__rounds-pts">{{ r.points.toLocaleString() }}</span>
            </li>
          </ol>

          <div class="guess-overlay__summary-actions">
            <button
              type="button"
              class="guess-overlay__primary"
              @click="emit('restart')"
            >
              PLAY AGAIN
            </button>
            <button
              type="button"
              class="guess-overlay__ghost"
              @click="emit('exit')"
            >
              EXIT
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.guess-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(10px, 2.5vh, 28px);
}

.guess-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 5, 0.72);
  backdrop-filter: blur(8px) saturate(1.1);
}

.guess-overlay__card {
  position: relative;
  width: min(1080px, 96vw);
  height: min(88vh, 820px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: clamp(12px, 2vw, 20px);
  border-radius: 18px;
  background: var(--glass-strong);
  border: 1px solid rgb(var(--phosphor-rgb) / 0.3);
  font-family: var(--font-mono);
}

.guess-overlay__header {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 0 0 auto;
}

.guess-overlay__title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.guess-overlay__badge {
  font-size: clamp(11px, 1.2vw, 13px);
  font-weight: 700;
  letter-spacing: 0.22em;
  color: var(--bg-0);
  background: var(--phosphor);
  padding: 0.35em 0.7em;
  border-radius: 6px;
}

.guess-overlay__round {
  font-size: clamp(12px, 1.3vw, 15px);
  letter-spacing: 0.18em;
  color: var(--text-dim);
}

.guess-overlay__score {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.guess-overlay__score-num {
  font-size: clamp(18px, 2.2vw, 26px);
  font-weight: 700;
  color: var(--phosphor-bright);
  font-variant-numeric: tabular-nums;
}

.guess-overlay__score-label {
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--text-mute);
}

.guess-overlay__exit-game {
  flex: 0 0 auto;
  appearance: none;
  border: 1px solid rgba(255, 90, 100, 0.4);
  border-radius: 8px;
  background: rgba(255, 90, 100, 0.08);
  color: #ff8a94;
  font-family: var(--font-mono);
  font-size: clamp(11px, 1.1vw, 13px);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 0.6em 0.95em;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.guess-overlay__exit-game:hover {
  background: rgba(255, 90, 100, 0.16);
  border-color: rgba(255, 90, 100, 0.6);
  color: #ffb3ba;
}

.guess-overlay__close {
  appearance: none;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-dim);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
}

.guess-overlay__close:hover {
  background: rgba(255, 90, 100, 0.14);
  border-color: rgba(255, 90, 100, 0.5);
  color: #ff8a94;
}

.guess-overlay__map {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  container-type: size;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Lock the map to a 2:1 box (matching the equirectangular viewBox) so the
   world never stretches and click->lat/lon mapping stays linear. Fits within
   the available area whether it's width- or height-constrained. */
.guess-overlay__mapbox {
  position: relative;
  aspect-ratio: 2 / 1;
  width: min(100%, 200cqh);
  height: auto;
}

.guess-overlay__footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 52px;
}

.guess-overlay__hint {
  font-size: clamp(12px, 1.3vw, 15px);
  color: var(--text-dim);
  letter-spacing: 0.04em;
}

.guess-overlay__result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.guess-overlay__result-main {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.guess-overlay__points {
  font-size: clamp(20px, 2.6vw, 30px);
  font-weight: 700;
  color: var(--phosphor-bright);
}

.guess-overlay__dist {
  font-size: clamp(12px, 1.4vw, 15px);
  color: #ff8a94;
  letter-spacing: 0.06em;
}

.guess-overlay__loc {
  font-size: clamp(11px, 1.2vw, 13px);
  color: var(--text);
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.guess-overlay__primary {
  margin-left: auto;
  appearance: none;
  border: 1px solid rgb(var(--phosphor-rgb) / 0.55);
  border-radius: 999px;
  background: rgb(var(--phosphor-rgb) / 0.12);
  color: var(--phosphor-bright);
  font-family: var(--font-mono);
  font-size: clamp(13px, 1.3vw, 16px);
  font-weight: 700;
  letter-spacing: 0.18em;
  padding: 0.85em 1.6em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.8em;
  white-space: nowrap;
  transition: background 140ms ease, border-color 140ms ease, opacity 140ms ease;
}

.guess-overlay__primary:hover:not(:disabled) {
  border-color: var(--phosphor);
  background: rgb(var(--phosphor-rgb) / 0.2);
}

.guess-overlay__primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.guess-overlay__kbd {
  font-size: 0.68em;
  font-weight: 600;
  color: var(--phosphor);
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgb(var(--phosphor-rgb) / 0.3);
  border-bottom-width: 2px;
  padding: 0.2em 0.5em;
  border-radius: 5px;
  letter-spacing: 0.1em;
}

/* --- Summary ----------------------------------------------------------- */
.guess-overlay__summary {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.guess-overlay__summary-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0 4px;
}

.guess-overlay__grade {
  font-size: clamp(13px, 1.6vw, 17px);
  letter-spacing: 0.3em;
  color: var(--phosphor);
}

.guess-overlay__final {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.guess-overlay__final-num {
  font-size: clamp(34px, 6vw, 60px);
  font-weight: 700;
  color: var(--phosphor-bright);
  font-variant-numeric: tabular-nums;
}

.guess-overlay__final-max {
  font-size: clamp(14px, 1.8vw, 20px);
  color: var(--text-mute);
}

.guess-overlay__final-pct {
  font-size: 12px;
  letter-spacing: 0.16em;
  color: var(--text-dim);
}

.guess-overlay__rounds {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--hairline);
}

.guess-overlay__rounds li {
  display: grid;
  grid-template-columns: 2em 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 0.6em 0.4em;
  border-bottom: 1px solid var(--hairline);
  font-size: clamp(11px, 1.2vw, 14px);
}

.guess-overlay__rounds-n {
  color: var(--text-mute);
  font-variant-numeric: tabular-nums;
}

.guess-overlay__rounds-loc {
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.guess-overlay__rounds-dist {
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.guess-overlay__rounds-pts {
  color: var(--phosphor-bright);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 4em;
  text-align: right;
}

.guess-overlay__summary-actions {
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
  gap: 12px;
}

.guess-overlay__summary-actions .guess-overlay__primary {
  margin-left: 0;
}

.guess-overlay__ghost {
  appearance: none;
  border: 1px solid var(--hairline-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: clamp(13px, 1.3vw, 16px);
  font-weight: 700;
  letter-spacing: 0.18em;
  padding: 0.85em 1.6em;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}

.guess-overlay__ghost:hover {
  color: var(--text);
  border-color: var(--text-dim);
}

.guess-fade-enter-active,
.guess-fade-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.guess-fade-enter-from,
.guess-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (max-width: 640px) {
  .guess-overlay__footer {
    flex-wrap: wrap;
  }

  .guess-overlay__primary {
    margin-left: 0;
    width: 100%;
    justify-content: center;
  }
}
</style>
