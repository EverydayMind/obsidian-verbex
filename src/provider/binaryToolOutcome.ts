import type { AgentToolOutcome } from '../core/llm/toolOutcome'

import {
  BinaryCommitError,
  type BinaryCommitResult,
} from './BinaryCommitPipeline'
import type { ProviderToolResult } from './contract'
import { ownershipHostBlock } from './interop/hostBlockState'
import { ownershipRetryable } from './ownershipTypes'

/** Only host execution facts determine this result; no model prose is inspected. */
export function binaryToolOutcome(
  proposalId: string,
  path: string,
  result: 'prepared' | 'rejected' | BinaryCommitResult | Error,
): ProviderToolResult {
  const failure = result instanceof Error
  const uncertain = result instanceof BinaryCommitError
  const committed = typeof result === 'object' && !failure
  const mutation = uncertain ? result.mutation : committed ? 'applied' : 'none'
  const state = failure
    ? mutation === 'unknown'
      ? 'unknown'
      : mutation === 'applied'
        ? 'applied'
        : 'failed'
    : typeof result === 'string'
      ? result
      : 'applied'
  const receipt = uncertain ? result.receipt : committed ? result : undefined
  const binaryReceipt: NonNullable<AgentToolOutcome['binaryReceipt']> = {
    state,
    proposalId,
    path,
    ...(receipt ?? {}),
  }
  const displayText = JSON.stringify({
    ...binaryReceipt,
    ...(failure ? { error: result.message } : {}),
    ...(uncertain ? { automaticallyRetry: false, requiresReview: true } : {}),
  })
  return {
    kind: 'outcome',
    outcome: {
      ...ownershipHostBlock(result),
      status:
        uncertain && mutation !== 'none'
          ? 'paused'
          : failure
            ? 'failed'
            : result === 'rejected'
              ? 'rejected'
              : 'succeeded',
      terminal: failure || result === 'rejected',
      mutation,
      mutationScope: 'vault',
      changedPath: path,
      mutationKey: `binary:${proposalId}`,
      retry: { allowed: ownershipRetryable(result, false) },
      binaryReceipt,
      displayText,
    },
  }
}
