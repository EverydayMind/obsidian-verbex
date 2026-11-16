import type { DocumentJobTurnPolicy } from './documentJobTurnPolicy'

/** P3 is finalized from the typed host result, never a model's prose. */
export function finishDocumentJobTurnPolicy(
  policy: DocumentJobTurnPolicy,
  prepareState: unknown,
  pending = false,
): DocumentJobTurnPolicy {
  return {
    ...policy,
    suppress: pending || (policy.intended && prepareState !== 'failed'),
    reason: pending ? [...policy.reason, 'pending_production'] : policy.reason,
  }
}
