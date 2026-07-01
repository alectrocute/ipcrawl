import type { ExploreCamDetail } from '#shared/explore'
import { apiExploreCamPath } from '#shared/routes'

/**
 * The single-cam dialog *is* a route: /?cam=<id> on top of whatever
 * filters are active. Opening pushes history (Back closes the dialog), closing
 * strips the param, and a shared/deep-linked URL SSR-fetches the detail so the
 * dialog content is part of the first paint over the sharer's filter context.
 *
 * Must be awaited in setup (it owns a useAsyncData) so SSR includes the detail.
 */
export async function useExploreCamDialog() {
  const route = useRoute()
  const router = useRouter()

  const camId = computed(() => (typeof route.query.cam === 'string' ? route.query.cam : ''))
  const open = computed(() => !!camId.value)

  // Nuxt caches `useAsyncData` by key and captures the *first* caller's handler
  // closure for the lifetime of that key. Both the catalogue (`/`) and the map
  // (`/map`) mount this composable under the same key, so on a client-side nav
  // between them the surviving handler still belongs to the *unmounted* page —
  // and that page's `useRoute()`/`camId` are frozen at their last values once
  // its scope is disposed (so the handler read an empty id and silently fetched
  // nothing). The router *instance* is an app-global singleton whose
  // `currentRoute` always reflects the live navigation, so read the id off that
  // and the handler stays correct no matter which page's closure wins.
  const { data: detail, status } = await useAsyncData<ExploreCamDetail | null>(
    'explore-cam-detail',
    () => {
      const raw = router.currentRoute.value.query.cam
      const id = typeof raw === 'string' ? raw : ''
      return id ? $fetch<ExploreCamDetail>(apiExploreCamPath(id)) : Promise.resolve(null)
    },
    { watch: [camId], default: () => null }
  )

  // `detail` nulls the instant ?cam= is stripped, which would flash a skeleton
  // into the modal's fade-out. Keep the last loaded detail mounted through the
  // transition; it's only cleared when a *different* cam opens.
  const displayDetail = ref<ExploreCamDetail | null>(detail.value)
  watch(detail, (d) => {
    if (d) displayDetail.value = d
  })
  watch(camId, (id) => {
    if (id && displayDetail.value && displayDetail.value.id !== id) displayDetail.value = null
  })
  const loading = computed(() => status.value === 'pending' && !displayDetail.value)

  // `replace` is for in-dialog navigation (arrow keys): the viewer flips
  // through many cams, but Back should still close the dialog rather than
  // unwind every cam they glanced at.
  const openCam = (id: string, opts: { replace?: boolean } = {}) => {
    const method = opts.replace ? router.replace : router.push
    return method.call(router, { query: { ...route.query, cam: id } })
  }
  function setOpen(value: boolean) {
    if (value) return
    const { cam: _cam, ...rest } = route.query
    router.replace({ query: rest })
  }

  return { open, camId, detail, displayDetail, loading, openCam, setOpen }
}
