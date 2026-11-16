import type { DocumentJobStore } from './jobStore'
import type { FormatJob } from './jobTypes'

const retryableCommitCauses = new Set([
  'grant_missing',
  'grant_digest_stale',
  'commit_disabled',
  'tool_disabled',
])

export function recoverableBlockedJob(job: FormatJob): boolean {
  return (
    job.status.state === 'blocked' &&
    (job.status.reason === 'exporter_unavailable' ||
      (job.status.reason === 'exporter_commit_not_ready' &&
        typeof job.status.details?.cause === 'string' &&
        retryableCommitCauses.has(job.status.details.cause)))
  )
}

/** Public store snapshot retains creation order even when timestamps tie. */
export function blockedJob(
  store: DocumentJobStore,
  conversationId: string,
  jobId: string,
) {
  const latest = store.conversationJobs(conversationId).at(-1)
  return latest?.id === jobId &&
    store.latestJobId(conversationId) === jobId &&
    recoverableBlockedJob(latest)
    ? latest
    : undefined
}
