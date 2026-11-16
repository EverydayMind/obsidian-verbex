/** Canonical JSON arguments for comparing otherwise identical observations. */
export function canonicalReadArgs(args: string | undefined): string {
  if (!args) return 'raw:' + (args ?? '')
  try {
    const parsed: unknown = JSON.parse(args)
    if (hasNonRoundTripNumber(parsed)) return 'raw:' + args
    return 'json:' + JSON.stringify(sortReadValue(parsed))
  } catch {
    return 'raw:' + args
  }
}

export function hasNonRoundTripNumber(value: unknown): boolean {
  if (typeof value === 'number')
    return !Number.isFinite(value) || Object.is(value, -0)
  if (Array.isArray(value)) return value.some(hasNonRoundTripNumber)
  if (value && typeof value === 'object')
    return Object.values(value).some(hasNonRoundTripNumber)
  return false
}

export function sortReadValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortReadValue)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, sortReadValue(source[key])]),
    )
  }
  return value
}
