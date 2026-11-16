import { documentJobRules } from '../../context/documentJobRules'
import type { FormatJob } from '../../core/document-jobs/jobTypes'

import { decompositionStatusFacts } from './decompositionResultFacts'
import { documentJobRecovery } from './documentJobRecovery'
import type { HostContext } from './editorActions'
import type { JsonObject } from './protocol'

export function jobStatusResult(job: FormatJob, ctx?: HostContext): JsonObject {
  if (job.status.state === 'blocked')
    return {
      job_id: job.id,
      state: 'blocked',
      reason: job.status.reason,
      recovery: documentJobRecovery(
        job.status.reason,
        job.status.details,
        ctx?.getActiveDiscovered('md-to-hwpx')?.descriptor?.provider.name,
      ),
      ...(job.status.details ? { details: job.status.details } : {}),
    }
  if (job.status.state === 'awaiting_choice')
    return {
      job_id: job.id,
      state: 'awaiting_choice',
      questions: [{ question: 'body', options: job.status.choices }],
    }
  if (job.status.state !== 'ready') throw new Error('Job is not ready.')
  const data = job.status.data
  return {
    job_id: job.id,
    state: 'ready',
    draft_contract: data.draftContract,
    draft_rules: documentJobRules(data.draftContract),
    ...decompositionStatusFacts(job),
    ...(data.outputRenamed ? { outputRenamed: data.outputRenamed } : {}),
  }
}
