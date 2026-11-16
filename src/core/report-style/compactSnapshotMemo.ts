import type { StyleSnapshot } from './types'

// Weak keys keep transport data only while its validated in-memory snapshot is live.
const retained = new WeakMap<StyleSnapshot, unknown>()

export function retainCompactSnapshot(
  snapshot: StyleSnapshot,
  packed: unknown,
): void {
  retained.set(snapshot, packed)
}

export function retainedCompactSnapshot(snapshot: StyleSnapshot): unknown {
  return retained.get(snapshot)
}
