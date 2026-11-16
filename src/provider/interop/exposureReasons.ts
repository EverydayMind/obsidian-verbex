import type { AllocationAttempt } from './exposureAllocation'
import type { NativeExposure } from './exposurePolicy'
import type { NativeToolEntry } from './NativeProviderHost'

export type AvailableExposureReason =
  | { name: string; reason: 'exposed' | 'excluded' | 'budget' | 'not_selected' }
  | {
      name: string
      reason: 'budget_blocked'
      blockedBy: NonNullable<AllocationAttempt['blockedBy']>
    }

/** Classifies only tools already admitted by host readiness and effect gates. */
export function availableExposureReasons(
  entries: readonly NativeToolEntry[],
  policy: NativeExposure,
  exposedNames: readonly string[],
  attempts: readonly AllocationAttempt[],
): AvailableExposureReason[] {
  const exposed = new Set(exposedNames)
  return entries.map((entry): AvailableExposureReason => {
    const name = entry.name
    if (
      policy.excludedTools.includes(name) &&
      !policy.skillTools.includes(name)
    )
      return { name, reason: 'excluded' }
    if (exposed.has(name)) return { name, reason: 'exposed' }
    const matching = attempts.filter((attempt) => attempt.tools.includes(name))
    if (matching.some((attempt) => attempt.result === 'budget'))
      return { name, reason: 'budget' }
    const skipped = matching.find(
      (attempt) => attempt.result === 'skipped' && attempt.blockedBy,
    )
    if (skipped?.blockedBy)
      return { name, reason: 'budget_blocked', blockedBy: skipped.blockedBy }
    return { name, reason: 'not_selected' }
  })
}
