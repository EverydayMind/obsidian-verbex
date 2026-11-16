/** Assert invariants established by the joined snapshot or the shared contract. */
export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Missing hierarchy invariant')
  return value
}
