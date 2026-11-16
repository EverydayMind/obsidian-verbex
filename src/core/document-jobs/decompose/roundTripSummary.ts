import type { RoundTrip } from './fitness'
import { numericRoundTripMetrics as numbers } from './roundTripTypes'

export function roundTripSummary(roundTrip: RoundTrip) {
  const { R1, R3, R4 } = roundTrip
  return {
    state: roundTrip.state,
    ...(roundTrip.declaredDifferences
      ? {
          declaredDifferences: roundTrip.declaredDifferences,
          rendererErrors: roundTrip.rendererErrors,
        }
      : {}),
    R1: numbers(R1),
    R3: R3 ? { mismatchCount: R3.mismatchCount } : null,
    R4: numbers(R4),
  }
}
