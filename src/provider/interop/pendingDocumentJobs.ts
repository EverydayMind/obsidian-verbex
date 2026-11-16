import type { DocumentJobPending } from '../../context/documentJobPendingFacts'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import type { FormatJob } from '../../core/document-jobs/jobTypes'

import { explicitPending, explicitPrevious } from './documentJobExplicitScope'
import { pendingPreviewFailure } from './documentJobPreviewFailure'
import type { HostContext } from './editorActions'
import {
  pendingContractFacts,
  pendingDraftExists,
  pendingNextStep,
} from './pendingContractDigest'
import type { JsonObject } from './protocol'
import type { DocumentJobRetryInput } from './retryBlockedDocumentJob'

/** Input jobs have already passed conversation, expiry and sample hash checks. */
export async function pendingDocumentJobs(
  jobs: readonly FormatJob[],
  store: DocumentJobStore,
  context: HostContext,
  input: DocumentJobRetryInput & { signal?: AbortSignal },
): Promise<DocumentJobPending[]> {
  const pending: DocumentJobPending[] = []
  for (const job of jobs) {
    input.signal?.throwIfAborted()
    if (job.status.state !== 'ready' || store.hasProduction(job.id)) continue
    const draftExists = await pendingDraftExists(
      context,
      job.status.data.draftPath,
      input.signal,
    )
    // Stay announced across bare continuations (job id, contract, next step).
    if (
      !draftExists &&
      !explicitPrevious(input, job.id) &&
      !explicitPending(input, job.id)
    )
      continue
    const failure = await pendingPreviewFailure(
      context,
      store,
      job,
      input.signal,
    )
    const nextStep = pendingNextStep(job, draftExists)
    if (!nextStep) continue
    const contractFacts = await pendingContractFacts(
      job.status.data.draftContract,
      input.signal,
    )
    input.signal?.throwIfAborted()
    pending.push({
      job_id: job.id,
      ...(explicitPending(input, job.id)
        ? { trigger: 'explicit' as const }
        : {}),
      ...contractFacts,
      draft_exists: draftExists,
      ...(failure ?? { nextStep: nextStep as JsonObject }),
    })
    if (pending.length === 3) break
  }
  return pending
}
