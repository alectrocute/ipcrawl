import { recordRequest } from '../utils/rpsTracker'

/**
 * Counts every incoming request for the /stats "Crawler status" RPS readout.
 * Runs after `offline-for-now` (alphabetical order), so 503'd traffic during
 * the kill switch isn't counted — that's not real load, just rejected load.
 * O(1) per request.
 */
export default defineEventHandler(() => {
  recordRequest()
})
