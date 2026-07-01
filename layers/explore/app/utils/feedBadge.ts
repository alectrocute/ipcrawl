export const EXPLORE_FEED_BADGE_LABEL = {
  live: 'LIVE',
  liveProbe: 'LIVE PROBE',
  snapshot: 'SNAPSHOT',
  connecting: 'CONNECTING'
} as const

export type ExploreFeedBadgeTone = 'live' | 'cached' | 'connecting'
