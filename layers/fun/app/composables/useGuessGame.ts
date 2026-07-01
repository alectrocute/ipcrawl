import type { FunCamChannel } from '#shared/fun'
import { haversineKm } from '#shared/geo'

export interface RoundResult {
  location: string | null
  actualLat: number
  actualLon: number
  guessLat: number
  guessLon: number
  distanceKm: number
  points: number
}

export type GuessPhase = 'guessing' | 'revealed' | 'summary'

const TOTAL_ROUNDS = 10
const MAX_POINTS = 5000
// Controls how quickly points fall off with distance. At 0km you score the
// full 5000; the score halves roughly every ~1386km.
const DECAY_KM = 2000

function pointsFor(distanceKm: number): number {
  if (distanceKm <= 1) return MAX_POINTS
  return Math.round(MAX_POINTS * Math.exp(-distanceKm / DECAY_KM))
}

/**
 * Session-scoped "Guess Mode" game state. A GeoGuessr-style mini-game played
 * over the live webcam feed: study the frame, drop a pin on the world map,
 * submit, and see how close you were. Ten rounds, then a final score.
 *
 * State lives in `useState` so the toggle (in the controls), the overlay, and
 * the channel page all share a single source of truth.
 */
export function useGuessGame() {
  const active = useState('guess-active', () => false)
  const phase = useState<GuessPhase>('guess-phase', () => 'guessing')
  const round = useState('guess-round', () => 1)
  const guess = useState<{ lat: number, lon: number } | null>('guess-pin', () => null)
  const results = useState<RoundResult[]>('guess-results', () => [])
  // The real coordinates of the current channel. Set by the page, never shown
  // to the player until they submit.
  const target = useState<{ lat: number | null, lon: number | null, location: string | null }>(
    'guess-target',
    () => ({ lat: null, lon: null, location: null })
  )

  const totalScore = computed(() => results.value.reduce((sum, r) => sum + r.points, 0))
  const maxScore = TOTAL_ROUNDS * MAX_POINTS
  const lastResult = computed<RoundResult | null>(() => results.value[results.value.length - 1] ?? null)
  const targetReady = computed(() => target.value.lat != null && target.value.lon != null)
  const isFinalRound = computed(() => round.value >= TOTAL_ROUNDS)

  function setTarget(cam: FunCamChannel | null) {
    target.value = {
      lat: cam?.lat ?? null,
      lon: cam?.lon ?? null,
      location: cam?.location ?? null
    }
  }

  function start() {
    active.value = true
    phase.value = 'guessing'
    round.value = 1
    guess.value = null
    results.value = []
  }

  function stop() {
    active.value = false
    phase.value = 'guessing'
    round.value = 1
    guess.value = null
    results.value = []
  }

  function placePin(lat: number, lon: number) {
    if (phase.value !== 'guessing') return
    guess.value = { lat, lon }
  }

  function submit() {
    if (phase.value !== 'guessing') return
    if (!guess.value) return
    if (target.value.lat == null || target.value.lon == null) return

    const distanceKm = haversineKm(
      guess.value.lat,
      guess.value.lon,
      target.value.lat,
      target.value.lon
    )
    results.value = [
      ...results.value,
      {
        location: target.value.location,
        actualLat: target.value.lat,
        actualLon: target.value.lon,
        guessLat: guess.value.lat,
        guessLon: guess.value.lon,
        distanceKm,
        points: pointsFor(distanceKm)
      }
    ]
    phase.value = 'revealed'
  }

  function advance() {
    if (round.value >= TOTAL_ROUNDS) {
      phase.value = 'summary'
      return
    }
    round.value += 1
    guess.value = null
    phase.value = 'guessing'
  }

  function restart() {
    round.value = 1
    guess.value = null
    results.value = []
    phase.value = 'guessing'
  }

  return {
    active,
    phase,
    round,
    guess,
    results,
    target,
    totalRounds: TOTAL_ROUNDS,
    maxPoints: MAX_POINTS,
    maxScore,
    totalScore,
    lastResult,
    targetReady,
    isFinalRound,
    setTarget,
    start,
    stop,
    placePin,
    submit,
    advance,
    restart,
    haversineKm
  }
}
