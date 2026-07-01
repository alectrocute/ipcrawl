import type { Cam } from './shodan'

interface BlockRule {
  country?: string
  city?: string
  org?: string
}

/**
 * Cams matching ANY of these rules are dropped. Fields within a rule are
 * ANDed; each field is a case-insensitive substring match against the cam's
 * country / city / org. Use this to mute hosts that aren't actually cams
 * (homelabs, captive portals, vendor demo pages, etc.).
 */
const BLOCKED: BlockRule[] = [
  { country: 'Japan', city: 'Tokyo', org: 'Asahi Net' }
]

/**
 * Cams whose stable `id` (the `ip:port` short hash) is listed here are dropped
 * outright. Use this to mute a specific host that slips past the rule-based
 * blocklist above.
 */
const BLOCKED_IDS = new Set<string>([
  'a44b7da717e1395b',
  'a5dff88816173eae'
])

function matchField(value: string | undefined, pattern: string | undefined): boolean {
  if (!pattern) return true
  if (!value) return false
  return value.toLowerCase().includes(pattern.toLowerCase())
}

export function isBlocked(cam: Pick<Cam, 'id' | 'country' | 'city' | 'org'>): boolean {
  if (BLOCKED_IDS.has(cam.id)) return true
  return BLOCKED.some(rule =>
    matchField(cam.country, rule.country)
    && matchField(cam.city, rule.city)
    && matchField(cam.org, rule.org)
  )
}
