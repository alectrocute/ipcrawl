import type { CamMeta } from './camStore'
import { getOpsSwitchState } from './opsSwitch'
import { readBooleanFlag } from './runtimeFlags'

// Service ports we know don't speak HTTP. Shodan's `has_screenshot:1` filter
// pulls in cams whose screenshot was captured via non-HTTP modules (RTSP,
// VNC, etc.) — useful for channel rotation, but not live probing.
const NON_HTTP_PORTS = new Set<number>([
  21, // FTP
  22, // SSH
  23, // Telnet
  25, // SMTP
  53, // DNS
  110, // POP3
  143, // IMAP
  554, // RTSP
  1935, // RTMP
  5060, // SIP
  5061 // SIP-TLS
])

// Shodan's `_shodan.module` values that we can probe over HTTP/HTTPS. Anything
// outside this prefix set (e.g. `rtsp`, `vnc`, `webcam`) is definitionally
// non-HTTP and we skip the probe regardless of port.
const HTTP_MODULE_PREFIXES = ['http', 'https']

export interface LiveProbeTarget {
  module?: string | null
  port: number | null
}

export function isLiveProbeReachable(cam: LiveProbeTarget): boolean {
  // Trust Shodan's module first. Cams from older refreshes may not have it yet,
  // so we fall through to the port heuristic for common RTSP/VNC ports.
  if (cam.module) {
    return HTTP_MODULE_PREFIXES.some(p => cam.module!.startsWith(p))
  }
  return typeof cam.port === 'number' && !NON_HTTP_PORTS.has(cam.port)
}

async function isLiveProbeEnabled(): Promise<boolean> {
  const config = useRuntimeConfig()
  if (!readBooleanFlag(config.enableLiveProbe, true)) return false

  const opsSwitch = await getOpsSwitchState()
  return !opsSwitch.expensiveWorkDisabled
}

export async function isLiveProbeActive(cam: LiveProbeTarget): Promise<boolean> {
  return (await isLiveProbeEnabled()) && isLiveProbeReachable(cam)
}

export async function filterLiveProbeCams(cams: CamMeta[]): Promise<CamMeta[]> {
  if (!(await isLiveProbeEnabled())) return []
  return cams.filter(isLiveProbeReachable)
}
