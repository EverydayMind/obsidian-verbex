import { toolFailed, toolSucceeded } from '../../core/llm/toolOutcome'
import type { ProviderRegistrySnapshot } from '../ProviderRegistry'

import { documentJobFailureOutcome } from './documentJobFailure'
import { documentJobHost } from './documentJobHost'
import { documentJobMutation } from './documentJobMutation'
import { notifyDocumentJobBlocked } from './documentJobNotice'
import type { PrepareRequest } from './documentJobPrepare'
import type { NativeProviderHost } from './NativeProviderHost'

export async function dispatchDocumentJob(
  host: NativeProviderHost | undefined,
  name: string,
  args: Record<string, unknown>,
  runId: string,
  turnId: string,
  snapshot?: ProviderRegistrySnapshot,
  signal?: AbortSignal,
) {
  const { conversationId, submittedTurnId } = snapshot?.caller ?? {}
  if (!host || !conversationId || !runId || !turnId)
    return toolFailed(
      'Document Job host or conversation identity unavailable.',
      { mutationScope: 'none' },
    )
  try {
    if (name === 'prepare_format_reuse') {
      const result = await documentJobHost(host).prepare(
        args as PrepareRequest,
        conversationId,
        signal,
      )
      notifyDocumentJobBlocked(host, runId, result, submittedTurnId)
      return toolSucceeded(JSON.stringify(result), {
        mutationScope: 'none',
        readFacts: { completeness: 'complete' },
      })
    }
    return await documentJobMutation(host, name, args, {
      conversationId,
      runId,
      turnId,
      snapshot,
      signal,
    })
  } catch (error) {
    return documentJobFailureOutcome(error)
  }
}
