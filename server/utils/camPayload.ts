import type { CamMeta } from './camStore'
import type { FunCamChannel } from '#shared/fun'
import { apiLiveFramePath } from '#shared/routes'
import { isLiveProbeActive } from './liveProbeStatus'

export interface CamPayload extends FunCamChannel {
  note: string | null
}

export async function buildCamPayload(cam: CamMeta, total: number): Promise<CamPayload> {
  return {
    id: cam.id,
    image: apiLiveFramePath(cam.id),
    liveProbeActive: await isLiveProbeActive(cam),
    location: [cam.city, cam.country].filter(Boolean).join(', ') || null,
    org: cam.org || null,
    note: 'If you are cheating in Guess Game by looking at this, you are no fun and the reason there is no public leaderboards lol it is not a flex but actually quite sad, if you challenge yourself you will grow and the clout you chase is really not what you think it is worth, you are loved, life is worth living, have a wonderful day',
    lat: typeof cam.lat === 'number' ? cam.lat : null,
    lon: typeof cam.lon === 'number' ? cam.lon : null,
    total
  }
}
