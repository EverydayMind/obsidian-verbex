import {
  type AgentToolOutcome,
  toolFailed,
  toolSucceeded,
} from '../../core/llm/toolOutcome'

import { refusedEditFact } from './refusedEditFact'
import type { SessionEditReceipt } from './sessionProtocol'

export function sessionOutcome({
  receipt,
  text,
  common,
  providerId,
  tool,
  path,
  incarnation,
  visible,
  preview,
  isError,
  retryable,
  location,
  observationStep,
}: {
  receipt: SessionEditReceipt
  text: string
  common: Pick<AgentToolOutcome, 'mutationScope' | 'mutationKey' | 'disclosure'>
  providerId: string
  tool: string
  path: string
  incarnation: string
  visible?: boolean
  preview: { handle: string; before: string; after: string }[]
  isError: boolean
  retryable: boolean
  location?: { handle?: string }
  /**
   * The protocol's show-then-resend step (`OBSERVATION_REQUIRED`, nothing
   * applied): the provider showed the current content and waits for the same
   * call again. It is a step of an edit, not a failed change, so it stays out
   * of the unreported-failure ledger.
   */
  observationStep?: boolean
}): AgentToolOutcome {
  return receipt.applied === 'yes'
    ? toolSucceeded(text, {
        ...common,
        mutation: 'applied',
        sessionEdit: {
          providerId,
          tool,
          path,
          sessionId: receipt.sessionId,
          incarnation,
          revisionBefore: receipt.revisionBefore,
          revisionAfter: receipt.revisionAfter,
          undoAvailable: receipt.undo?.available === true,
          changedPages: receipt.changedPages,
          preview,
          ...(visible === undefined ? {} : { visible }),
        },
      })
    : isError
      ? toolFailed(text, {
          ...common,
          ...(observationStep
            ? {
                mutationScope: 'none' as const,
                notApplied: 'observation_step' as const,
              }
            : {}),
          ...(location
            ? {
                sessionEdit: refusedEditFact(
                  providerId,
                  tool,
                  incarnation,
                  receipt,
                  location,
                ),
              }
            : {}),
          terminal: false,
          retry: { allowed: retryable },
        })
      : // Verified success without a change: clears an earlier failure of this operation.
        toolSucceeded(text, { ...common, mutationResolution: 'resolved' })
}
