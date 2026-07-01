import type { ExploreFavoriteResponse } from '#shared/explore'
import { EXPLORE_MAX_FAVORITES } from '#shared/explore'
import { apiExploreFavoritePath } from '#shared/routes'

/**
 * Cookie-backed favorite cam ids. A cookie (vs localStorage) so the SSR pass
 * sees the same list the client does — hearts and the Favorites filter render
 * correctly on first paint with no hydration flicker. Nuxt syncs same-named
 * cookie refs, so toggling on a card updates every consumer reactively.
 *
 * Toggles also cast an anonymized public vote via POST (deduped per IP
 * server-side); `countOf` overlays the optimistic/authoritative tally on top
 * of the (SWR-cached, so slightly stale) counts baked into list rows.
 */
export function useExploreFavorites() {
  const cookie = useCookie<string[]>('explore-favorites', {
    default: () => [],
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax'
  })

  // Session-scoped count overrides: optimistic on toggle, replaced by the
  // server's authoritative tally when the vote lands.
  const counts = useState<Record<string, number>>('explore-fav-counts', () => ({}))

  const favorites = computed<string[]>(() =>
    Array.isArray(cookie.value) ? cookie.value.filter(id => typeof id === 'string') : []
  )

  const has = (id: string) => favorites.value.includes(id)

  const countOf = (id: string, serverCount: number) => counts.value[id] ?? serverCount

  function toggle(id: string, serverCount = 0) {
    const on = !has(id)
    const next = on
      ? [...favorites.value, id]
      : favorites.value.filter(f => f !== id)
    // Oldest favorites fall off first once over the cap.
    cookie.value = next.slice(-EXPLORE_MAX_FAVORITES)

    counts.value[id] = Math.max(0, countOf(id, serverCount) + (on ? 1 : -1))
    $fetch<ExploreFavoriteResponse>(apiExploreFavoritePath(id), {
      method: 'POST',
      body: { on }
    })
      .then((res) => {
        counts.value[id] = res.count
      })
      .catch(() => {
        // Vote didn't land (offline / capped) — roll the optimistic bump back.
        counts.value[id] = Math.max(0, countOf(id, serverCount) + (on ? -1 : 1))
      })
  }

  return { favorites, has, countOf, toggle }
}
