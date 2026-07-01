export function useCopyPageUrl() {
  const appConfig = useAppConfig()
  const resetAfterMs = appConfig.timing?.ui?.copyUrlResetMs ?? 1500
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  async function copyCurrentPageUrl(): Promise<void> {
    if (!import.meta.client) return
    try {
      await navigator.clipboard.writeText(window.location.href)
      copied.value = true
      clearTimer()
      timer = setTimeout(() => {
        copied.value = false
        timer = null
      }, resetAfterMs)
    } catch {
      copied.value = false
    }
  }

  onScopeDispose(clearTimer)

  return {
    copied,
    copyCurrentPageUrl
  }
}
