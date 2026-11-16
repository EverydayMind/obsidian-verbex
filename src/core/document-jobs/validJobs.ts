import type { DocumentJobStore } from './jobStore'
import type { FormatJob } from './jobTypes'

/** Rebind every lookup after I/O; neither cached jobs nor old hashes are authority. */
export async function validDocumentJobs(input: {
  store: DocumentJobStore
  conversationId: string
  hash: (path: string) => Promise<string>
  jobId?: string
  signal?: AbortSignal
}): Promise<FormatJob[]> {
  input.signal?.throwIfAborted()
  if (!input.conversationId) return []
  let ids: string[]
  try {
    ids =
      input.jobId !== undefined
        ? [input.jobId]
        : input.store
            .activeJobs(input.conversationId)
            .reverse()
            .map((job) => job.id)
  } catch {
    return []
  }
  const jobs: FormatJob[] = []
  for (const id of ids) {
    try {
      const path = input.store.sourcePath(id, input.conversationId)
      const sha = await input.hash(path)
      input.signal?.throwIfAborted()
      jobs.push(input.store.getJob(id, input.conversationId, sha))
    } catch {
      input.signal?.throwIfAborted()
      // Missing, expired, foreign and changed samples cannot establish a fact.
    }
  }
  return jobs.flatMap((job) => {
    try {
      return [
        input.store.getJob(job.id, input.conversationId, job.sampleSha256),
      ]
    } catch {
      return []
    }
  })
}

export function pendingDocumentQuestions(jobs: readonly FormatJob[]) {
  return jobs
    .filter((job) => job.status.state === 'awaiting_choice')
    .slice(0, 3)
    .map((job) => ({
      job_id: job.id,
      question: 'body',
      options:
        job.status.state === 'awaiting_choice'
          ? job.status.choices.map((choice) => choice.option)
          : [],
    }))
}

export function activeDocumentJobCandidates(
  jobs: Iterable<FormatJob>,
  conversationId: string,
): FormatJob[] {
  return [...jobs]
    .filter(
      (job) =>
        job.conversationId === conversationId &&
        (job.status.state === 'ready' ||
          job.status.state === 'awaiting_choice'),
    )
    .map((job) => structuredClone(job))
}
