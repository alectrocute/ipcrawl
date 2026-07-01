import { readBooleanFlag } from './runtimeFlags'

export interface OpsSwitchState {
  expensiveWorkDisabled: boolean
  source: string | null
}

export function getOpsSwitchState(): OpsSwitchState {
  const config = useRuntimeConfig()

  if (readBooleanFlag(config.edgeKillSwitch, false)) {
    return { expensiveWorkDisabled: true, source: 'env' }
  }

  return { expensiveWorkDisabled: false, source: null }
}
