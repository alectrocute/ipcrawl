export type WaitUntil = (promise: Promise<unknown>) => void

export interface EdgeRuntimeContext {
  waitUntil?: WaitUntil
}
