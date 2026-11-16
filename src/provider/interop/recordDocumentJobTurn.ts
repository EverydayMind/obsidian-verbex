import type { TurnRecord } from '../../runstate/turnLedger'

import type { prepareDocumentJobTurn } from './prepareDocumentJobTurn'

/** Store only the typed, turn-owned preparation and pending facts. */
export function recordDocumentJobTurn(
  record: TurnRecord | undefined,
  result: Awaited<ReturnType<typeof prepareDocumentJobTurn>>,
) {
  if (record && 'pending' in result) record.documentJobPending = result.pending
  if ('result' in result && result.samplePath && result.result && record)
    record.documentJobPreparation = {
      samplePath: result.samplePath,
      result: result.result,
      trigger: result.policy.intended ? 'explicit' : 'structural',
      execution: result.execution ?? 'not_executed',
      referenceSource: result.policy.referenceSource,
      ...(result.policy.retryOf ? { retryOf: result.policy.retryOf } : {}),
    }
}
