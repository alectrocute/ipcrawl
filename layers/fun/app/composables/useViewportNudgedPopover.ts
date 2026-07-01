interface ViewportNudgedPopoverOptions {
  visible: Ref<boolean>
  align?: 'center' | 'start'
  margin?: number
}

export function useViewportNudgedPopover(
  popover: Ref<HTMLElement | null>,
  options: ViewportNudgedPopoverOptions
) {
  const nudge = ref(0)
  const align = options.align ?? 'center'
  const margin = options.margin ?? 12

  const popoverStyle = computed(() => ({
    '--popover-nudge': `${nudge.value}px`,
    '--popover-tail-nudge': `${-nudge.value}px`
  }))

  let rafId: number | null = null
  let resizeObserver: ResizeObserver | null = null

  function measure() {
    if (import.meta.server) return

    const el = popover.value
    const anchor = el?.parentElement
    if (!el || !anchor) return

    const anchorRect = anchor.getBoundingClientRect()
    const popoverWidth = el.offsetWidth
    if (!popoverWidth) return

    const viewportWidth = document.documentElement.clientWidth || window.innerWidth
    const triggerCenter = anchorRect.left + anchorRect.width / 2
    const idealLeft = align === 'start'
      ? anchorRect.left
      : triggerCenter - popoverWidth / 2
    const maxLeft = Math.max(margin, viewportWidth - margin - popoverWidth)
    const clampedLeft = Math.min(Math.max(idealLeft, margin), maxLeft)

    nudge.value = Math.round((clampedLeft - idealLeft) * 100) / 100
  }

  function scheduleMeasure() {
    if (!options.visible.value || import.meta.server) return
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      rafId = null
      measure()
    })
  }

  function refresh() {
    if (import.meta.server) return
    nextTick(() => measure())
  }

  function observePopover(el: HTMLElement | null) {
    if (!resizeObserver) return
    resizeObserver.disconnect()
    if (!el) return
    resizeObserver.observe(el)
    if (el.parentElement) resizeObserver.observe(el.parentElement)
  }

  watch(
    () => options.visible.value,
    (visible) => {
      if (visible) refresh()
      else nudge.value = 0
    },
    { flush: 'post' }
  )

  watch(popover, (el) => {
    observePopover(el)
    if (options.visible.value) refresh()
  })

  onMounted(() => {
    resizeObserver = new ResizeObserver(scheduleMeasure)
    observePopover(popover.value)
    window.addEventListener('resize', scheduleMeasure)
    window.addEventListener('scroll', scheduleMeasure, true)
    if (options.visible.value) refresh()
  })

  onBeforeUnmount(() => {
    if (rafId !== null) cancelAnimationFrame(rafId)
    resizeObserver?.disconnect()
    window.removeEventListener('resize', scheduleMeasure)
    window.removeEventListener('scroll', scheduleMeasure, true)
  })

  return { popoverStyle, measure: refresh }
}
