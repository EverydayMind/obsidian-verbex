import type { TurnRecord } from '../runstate/turnLedger'

import {
  DOCUMENT_JOB_OUTPUT_NAME_GUIDANCE,
  DOCUMENT_JOB_PRODUCTION_GUIDANCE,
} from './documentJobPendingGuidance'
import {
  pendingJobIntroduction,
  pendingJobRows,
} from './documentJobPendingIntroduction'

export type { DocumentJobPending } from './documentJobPendingContracts'

/** Only this turn's validated facts survive into the model context. */
export function documentJobPendingFacts(turn?: TurnRecord): string[] {
  const pending = (turn?.documentJobPending ?? []).filter(
    (job) =>
      turn?.documentJobPreparation?.result.state !== 'ready' ||
      job.job_id !== turn.documentJobPreparation.result.job_id,
  )
  return pending.length
    ? [
        ...pendingJobIntroduction(),
        DOCUMENT_JOB_PRODUCTION_GUIDANCE(),
        DOCUMENT_JOB_OUTPUT_NAME_GUIDANCE(),
        ...pendingJobRows(pending),
      ]
    : []
}
export {
  DOCUMENT_JOB_PRODUCTION_GUIDANCE,
  DOCUMENT_JOB_OUTPUT_NAME_GUIDANCE,
} from './documentJobPendingGuidance'
