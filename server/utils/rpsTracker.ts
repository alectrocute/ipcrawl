// In-process request-rate tracker for the /stats "Crawler status" panel.
// The node-server preset runs one long-lived process, so an in-process sliding
// window is the natural scope — same reasoning as the rate limiter.

const WINDOW_SEC = 60
const buckets = new Array<number>(WINDOW_SEC).fill(0)
// Second-index (Unix seconds) currently held in `buckets[currentBucketSec % WINDOW_SEC]`.
let currentBucketSec = 0
let total = 0
let peak = 0
const startedAt = Date.now()

/**
 * Zero out buckets that have aged out of the window as we advance `currentBucketSec`.
 * Called on every record + every read so the array always reflects the last 60s
 * regardless of when traffic last arrived.
 */
function advanceTo(nowSec: number): void {
  const elapsed = nowSec - currentBucketSec
  if (elapsed <= 0) return
  if (elapsed >= WINDOW_SEC) {
    buckets.fill(0)
  } else {
    for (let i = 1; i <= elapsed; i++) {
      const idx = (currentBucketSec + i) % WINDOW_SEC
      // Before zeroing, treat the bucket's previous value as a finished 1s window
      // — track it as a peak candidate. (Skipped on the very first advance where
      // the bucket is freshly initialized to 0.)
      if (currentBucketSec !== 0 && buckets[idx]! > peak) peak = buckets[idx]!
      buckets[idx] = 0
    }
  }
  currentBucketSec = nowSec
}

/** Called from middleware on every incoming request. O(1). */
export function recordRequest(): void {
  const nowSec = Math.floor(Date.now() / 1000)
  if (nowSec !== currentBucketSec) advanceTo(nowSec)
  const idx = nowSec % WINDOW_SEC
  const next = (buckets[idx] ?? 0) + 1
  buckets[idx] = next
  if (next > peak) peak = next
  total++
}

export interface RpsSnapshot {
  /** Smoothed requests/sec over the trailing 60s (count / 60). */
  current: number
  /** Peak requests/sec observed in any 1s bucket over the trailing 60s. */
  peak: number
  /** Total requests served since the Node process started. */
  total: number
  /** Node process uptime in seconds. */
  uptimeSec: number
}

/** Reads the trailing-60s window. O(WINDOW_SEC) = O(60). */
export function getRps(): RpsSnapshot {
  const now = Date.now()
  const nowSec = Math.floor(now / 1000)
  if (nowSec !== currentBucketSec) advanceTo(nowSec)
  let sum = 0
  for (let i = 0; i < WINDOW_SEC; i++) sum += buckets[i] ?? 0
  return {
    current: sum / WINDOW_SEC,
    peak,
    total,
    uptimeSec: (now - startedAt) / 1000
  }
}
