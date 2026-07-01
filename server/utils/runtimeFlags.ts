const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on', 'enabled'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'n', 'off', 'disabled'])

export function readBooleanFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value !== 'string') return fallback

  const normalized = value.trim().toLowerCase()
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return fallback
}
