import { type AgentToolOutcome, toolFailed } from '../../core/llm/toolOutcome'
import { aiPrivateErrorOutcome } from '../../security/aiPrivateRefusal'

import { InvalidDocumentJobPrepareRequest } from './documentJobPrepare'

/** A Document Job error as a tool result; an AI-private read stays a refusal. */
export function documentJobFailureOutcome(error: unknown): AgentToolOutcome {
  return (
    aiPrivateErrorOutcome(error) ??
    toolFailed(
      error instanceof Error ? error.message : 'Document Job failed.',
      {
        mutationScope: 'none',
        ...(error instanceof InvalidDocumentJobPrepareRequest
          ? { terminal: false, retry: { allowed: true } }
          : {}),
      },
    )
  )
}
