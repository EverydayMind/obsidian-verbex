import { splitAgentHistory } from '../../context/agentSourcePolicy'
import { isBareContinuation } from '../../context/bareContinuation'
import { blockedJob } from '../../core/document-jobs/blockedJob'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import type { TurnRecord } from '../../runstate/turnLedger'
import type { RequestMessage } from '../../types/llm/request'

import type { DocumentJobTurnPolicy } from './documentJobTurnPolicy'

export type DocumentJobRetryInput = {
  request: string
  history?: RequestMessage[]
  isContinuationSignal?: boolean
  previousSubmittedTurnId?: string
  previousTurnRecord?: TurnRecord
}

/** Only one exact completed submission may supply the blocked candidate. */
export async function retryBlockedDocumentJob(
  store: DocumentJobStore,
  conversationId: string,
  policy: DocumentJobTurnPolicy,
  active: boolean,
  input: DocumentJobRetryInput,
  hash: (path: string) => Promise<string>,
  signal?: AbortSignal,
): Promise<DocumentJobTurnPolicy> {
  const { priorHistory } = splitAgentHistory(input.history ?? [], input.request)
  const previous = input.previousTurnRecord
  const preparation = previous?.documentJobPreparation
  if (
    active ||
    policy.referencedHwp === 'multiple' ||
    policy.referencedHwp === 'uncertain' ||
    (typeof policy.referencedHwp === 'object' &&
      policy.referencedHwp.source === 'explicit') ||
    !isBareContinuation({ ...input, isFirstTurn: !priorHistory.length }) ||
    !input.previousSubmittedTurnId ||
    previous?.turnId !== input.previousSubmittedTurnId ||
    preparation?.result.state !== 'blocked' ||
    typeof preparation.result.job_id !== 'string' ||
    !preparation.trigger ||
    !preparation.referenceSource
  )
    return policy
  const job = blockedJob(store, conversationId, preparation.result.job_id)
  if (!job) return policy
  try {
    const sha = await hash(job.samplePath)
    signal?.throwIfAborted()
    if (sha !== job.sampleSha256 || !blockedJob(store, conversationId, job.id))
      return policy
  } catch {
    signal?.throwIfAborted()
    return policy
  }
  return {
    referencedHwp: {
      path: job.samplePath,
      source: preparation.referenceSource,
    },
    referenceSource: preparation.referenceSource,
    intended: preparation.trigger === 'explicit',
    autoPrepare: true,
    expose: true,
    suppress: false,
    reason: ['retry_blocked'],
    retryOf: job.id,
  }
}
