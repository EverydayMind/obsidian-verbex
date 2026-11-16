import { splitAgentHistory } from '../../context/agentSourcePolicy'
import { isBareContinuation } from '../../context/bareContinuation'
import type { FormatJob } from '../../core/document-jobs/jobTypes'
import type { StructureObservation } from '../../core/tools/localChangePreparation'
import type { ProposedChange } from '../../verbex/types'

import { documentJobNextStepFact } from './documentJobNextStepFact'
import type { DocumentJobRetryInput } from './retryBlockedDocumentJob'

export function explicitPending(
  input: DocumentJobRetryInput,
  jobId: string,
): boolean {
  const { priorHistory } = splitAgentHistory(input.history ?? [], input.request)
  const previous = input.previousTurnRecord
  return Boolean(
    isBareContinuation({ ...input, isFirstTurn: !priorHistory.length }) &&
      input.previousSubmittedTurnId &&
      previous?.turnId === input.previousSubmittedTurnId &&
      ((previous.documentJobPreparation?.trigger === 'explicit' &&
        previous.documentJobPreparation.result.job_id === jobId) ||
        previous.documentJobPending?.some(
          (job) => job.job_id === jobId && job.trigger === 'explicit',
        )),
  )
}

export function explicitPrevious(
  input: DocumentJobRetryInput,
  jobId: string,
): boolean {
  const previous = input.previousTurnRecord
  return Boolean(
    input.previousSubmittedTurnId &&
      previous?.turnId === input.previousSubmittedTurnId &&
      previous.documentJobPreparation?.trigger === 'explicit' &&
      previous.documentJobPreparation.result.job_id === jobId,
  )
}

export function scopedNextStep(
  job: FormatJob,
  trigger?: 'explicit' | 'structural',
  ids?: readonly string[],
  observation?: StructureObservation,
): string {
  return documentJobNextStepFact(
    job,
    ids?.includes(job.id) ? 'explicit' : trigger,
    observation,
  )
}

export function eligibleDocumentWrite(
  change: ProposedChange,
): change is ProposedChange & { after: string } {
  return (
    !change.composite &&
    ['create', 'modify'].includes(change.op) &&
    typeof change.after === 'string' &&
    /\.md$/i.test(change.path)
  )
}

export function explicitCandidates(
  jobs: FormatJob[],
  trigger?: 'explicit' | 'structural',
  ids?: readonly string[],
): FormatJob[] {
  return trigger === 'explicit'
    ? jobs
    : jobs.filter((job) => ids?.includes(job.id))
}
