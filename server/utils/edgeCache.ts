export type WaitUntil = (promise: Promise<unknown>) => void

export interface EdgeRuntimeContext {
  waitUntil?: WaitUntil
}

export function defaultEdgeCache(): Cache | null {
  const maybeGlobal = globalThis as typeof globalThis & {
    caches?: { default?: Cache }
  }
  return maybeGlobal.caches?.default ?? null
}

export function edgeCacheKeyFor(url: string): Request {
  return new Request(url, { method: 'GET' })
}
