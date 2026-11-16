export function compactDecomposition(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const {
    judgements: _judgements,
    roundTrip: _roundTrip,
    spacingVariance: _spacingVariance,
    unifiedDifferences: _unifiedDifferences,
    omittedObjectSpacing: _omittedObjectSpacing,
    ...copy
  } = value as Record<string, unknown>
  return copy
}
