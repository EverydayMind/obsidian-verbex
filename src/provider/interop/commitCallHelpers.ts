import type { CommitCall } from './commitCall'
import type { CommitPreparation } from './commitProtocol'
import { RESULT_LIMITS, copyJson } from './descriptorReader'
import { copyDocumentJobArgs } from './documentJobArgs'
import { copyNativeToolArgs } from './nativeToolArgs'
import type { JsonObject } from './protocol'

export function deliverCommitPreparation(
  call: CommitCall,
  preparation: CommitPreparation,
): void {
  if (call.onPrepared)
    call.onPrepared({
      preparationId: preparation.preparationId,
      report: copyJson(preparation.report, RESULT_LIMITS) as JsonObject,
      destination: preparation.destination,
      mode: preparation.mode,
      writeSet: copyJson(
        preparation.writeSet,
        RESULT_LIMITS,
      ) as CommitPreparation['writeSet'],
    })
}

export function copyCommitArguments(call: CommitCall) {
  return call.hostOutputAnchorLeaseId
    ? copyDocumentJobArgs(call.args)
    : copyNativeToolArgs(call.args)
}

export const preparedReportLines = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 20)
        .map((item) => item.slice(0, 300))
    : []
