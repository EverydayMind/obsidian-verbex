import type { DocumentJobStore } from '../jobStore'
import type { FormatJob } from '../jobTypes'

/** A confirmed draft write or produce invocation can skip optional pair saving. */
export function skipDecompositionSave(
  store: DocumentJobStore,
  job: FormatJob,
): void {
  if (
    job.status.state !== 'ready' ||
    job.status.data.decomposition?.facts.state !== 'pending_save'
  )
    return
  const data = job.status.data
  data.decomposition = {
    facts: {
      ...data.decomposition?.facts,
      state: 'not_saved',
      cause: 'skipped',
    },
  }
  store.transition(job.id, job.conversationId, job.sampleSha256, {
    state: 'ready',
    data: data,
  })
}
