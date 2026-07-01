import type { CamMeta } from '../camStore'
import { httpGet, probeBase, rememberLogKey } from './httpClient'
import { coerceImageFrame } from './imageFrame'
import { PROBE_CONCURRENCY, SNAPSHOT_PATHS } from './snapshotPaths'
import { getLiveTimingMs } from './timing'

/**
 * Snapshot-path discovery: race the well-known path list against a camera in
 * small concurrent batches until one path serves a real image, with per-run
 * diagnostics rolled up into a single summary log line.
 */

// Set of (origin|status|content-type) tuples we've already logged for
// non-image / non-2xx responses. Same dedup motivation as the transport
// layer's fetch-error set: surface each distinct failure mode once.
const loggedProbeMisses = new Set<string>()

function bodySnippet(body: Uint8Array, ct: string): string {
  // Only worth surfacing textual bodies — binary 403 pages don't tell us
  // anything actionable, and JPEG bytes would just be line noise in tail.
  const isText = ct.startsWith('text/')
    || ct.includes('json')
    || ct.includes('xml')
    || ct === ''
  if (!isText || body.length === 0) return ''
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(body.subarray(0, 256))
  } catch {
    return ''
  }
  return ' body=' + JSON.stringify(text.replace(/\s+/g, ' ').trim().slice(0, 200))
}

function noteProbeMiss(
  base: string,
  path: string,
  status: number,
  ct: string,
  body?: Uint8Array
): void {
  if (!rememberLogKey(loggedProbeMisses, `${base}|${status}|${ct}`)) return
  const snippet = body ? bodySnippet(body, ct) : ''
  console.log(
    `[ipcrawl] live probe miss  ${base}${path} → status=${status} ct=${ct || '(none)'}${snippet}`
  )
}

// Bytes we read on the probe pass to confirm a candidate path actually
// serves an image. JPEG / PNG signatures are in the first 4 bytes, but we
// pull 8 KiB so (a) an HTML login page that mislabels its content-type as
// `image/jpeg` is still rejected by `coerceImageFrame`'s body sniff, and
// (b) an MJPEG/multipart part's embedded JPEG SOI is within the peek.
const PROBE_PEEK_BYTES = 8 * 1024

// Per-attempt diagnostic info. Accumulated across every path tried in a
// single `probeSnapshot` run and rolled up into one summary log line so
// `wrangler tail` shows the whole failure mode without spamming.
type ProbeResultKind
  = { kind: 'hit' }
    | { kind: 'no-reply', reason: string }
    | { kind: 'non-2xx', status: number, contentType: string }
    | { kind: 'non-image-ct', status: number, contentType: string }
    | { kind: 'non-image-body', status: number, contentType: string }

interface ProbeOutcome {
  path: string
  elapsedMs: number
  result: ProbeResultKind
}

async function probePath(base: string, path: string, signal?: AbortSignal): Promise<ProbeOutcome> {
  const { liveProbeTimeout } = getLiveTimingMs()
  const t0 = Date.now()
  const reply = await httpGet(base + path, liveProbeTimeout, PROBE_PEEK_BYTES, true, 3, signal)
  const elapsedMs = Date.now() - t0
  if (!('status' in reply)) {
    return { path, elapsedMs, result: { kind: 'no-reply', reason: reply.error } }
  }
  if (reply.status < 200 || reply.status >= 300) {
    noteProbeMiss(base, path, reply.status, reply.contentType, reply.body)
    return {
      path,
      elapsedMs,
      result: { kind: 'non-2xx', status: reply.status, contentType: reply.contentType }
    }
  }
  if (coerceImageFrame(reply.body, reply.contentType)) {
    return { path, elapsedMs, result: { kind: 'hit' } }
  }
  if (!reply.contentType.startsWith('image/')) {
    noteProbeMiss(base, path, reply.status, reply.contentType, reply.body)
    return {
      path,
      elapsedMs,
      result: { kind: 'non-image-ct', status: reply.status, contentType: reply.contentType }
    }
  }
  noteProbeMiss(base, path, reply.status, `${reply.contentType} (body not image)`)
  return {
    path,
    elapsedMs,
    result: { kind: 'non-image-body', status: reply.status, contentType: reply.contentType }
  }
}

interface RaceResult {
  hit: string | null
  outcomes: ProbeOutcome[]
}

/**
 * Race a batch of snapshot paths concurrently against one camera. First path
 * that responds with a real image wins immediately; stragglers continue but
 * their results are discarded. Resolves with hit=null only when every path
 * in the batch has finished (success or failure) without a hit. The full
 * per-path outcome list is bubbled up for the probe-summary log.
 */
function raceFirstHit(base: string, paths: string[]): Promise<RaceResult> {
  return new Promise((resolve) => {
    const outcomes: ProbeOutcome[] = []
    let pending = paths.length
    let done = false
    const ctrl = new AbortController()
    const settle = (hit: string | null) => {
      if (done) return
      done = true
      ctrl.abort()
      resolve({ hit, outcomes })
    }
    for (const path of paths) {
      probePath(base, path, ctrl.signal).then(
        (out) => {
          outcomes.push(out)
          if (out.result.kind === 'hit') settle(out.path)
          else if (--pending === 0) settle(null)
        },
        () => {
          // probePath swallows its own errors and returns a no-reply outcome,
          // so this path is defensive. Treat as no-reply with unknown timing.
          outcomes.push({
            path,
            elapsedMs: 0,
            result: { kind: 'no-reply', reason: 'probe-threw' }
          })
          if (--pending === 0) settle(null)
        }
      )
    }
  })
}

function summarizeOutcomeKey(o: ProbeOutcome): string {
  switch (o.result.kind) {
    case 'hit':
      return 'hit'
    case 'no-reply':
      return `no-reply:${o.result.reason}`
    case 'non-2xx':
      return `${o.result.status} ${o.result.contentType || '(none)'}`
    case 'non-image-ct':
      return `${o.result.status} ${o.result.contentType} [non-image-ct]`
    case 'non-image-body':
      return `${o.result.status} ${o.result.contentType} [non-image-body]`
  }
}

function logProbeSummary(
  camId: string,
  base: string,
  hit: string | null,
  outcomes: ProbeOutcome[],
  elapsedMs: number,
  budgetHit: boolean
): void {
  const tally = new Map<string, number>()
  let fastest = Infinity
  let slowest = 0
  for (const o of outcomes) {
    if (o.elapsedMs < fastest) fastest = o.elapsedMs
    if (o.elapsedMs > slowest) slowest = o.elapsedMs
    const k = summarizeOutcomeKey(o)
    tally.set(k, (tally.get(k) ?? 0) + 1)
  }
  const breakdown = Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
  const timings = outcomes.length ? ` rt=${fastest}-${slowest}ms` : ''
  const budget = budgetHit ? ' BUDGET-HIT' : ''
  console.log(
    `[ipcrawl] live probe summary ${camId} ${base} → ${hit ?? 'none'} `
    + `(${outcomes.length}/${SNAPSHOT_PATHS.length} attempts in ${elapsedMs}ms${budget}${timings})`
    + (breakdown ? ` | ${breakdown}` : '')
  )
}

/**
 * Discover a working snapshot path for `cam` by racing the path list in
 * small concurrent batches with a global wall-clock budget. The batching
 * keeps the load on the camera bounded; the wall-clock budget guarantees
 * we never blow past Workers' request duration even when every path is
 * a dead end.
 */
export async function probeSnapshot(cam: CamMeta): Promise<string | null> {
  const { liveProbeBudget } = getLiveTimingMs()
  const base = probeBase(cam)
  const startedAt = Date.now()
  const allOutcomes: ProbeOutcome[] = []
  let hit: string | null = null
  let budgetHit = false

  for (let i = 0; i < SNAPSHOT_PATHS.length; i += PROBE_CONCURRENCY) {
    if (Date.now() - startedAt > liveProbeBudget) {
      budgetHit = true
      break
    }
    const batch = SNAPSHOT_PATHS.slice(i, i + PROBE_CONCURRENCY)
    const result = await raceFirstHit(base, batch)
    allOutcomes.push(...result.outcomes)
    if (result.hit) {
      hit = result.hit
      break
    }
  }

  logProbeSummary(cam.id, base, hit, allOutcomes, Date.now() - startedAt, budgetHit)
  return hit
}
