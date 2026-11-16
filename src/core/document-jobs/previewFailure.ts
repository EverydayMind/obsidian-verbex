import type { DocumentJobStore } from './jobStore'
import type { FormatJob } from './jobTypes'

export type PreviewFailure = {
  code: string
  draftPath: string
  draftSha256: string
  sourcePath: string
  sourceSha256: string
  at: number
}

const records = new WeakMap<
  DocumentJobStore,
  Map<string, { failure: PreviewFailure; expiresAt: number }>
>()
export function recordPreviewFailure(
  store: DocumentJobStore,
  job: FormatJob,
  failure: PreviewFailure,
) {
  let jobs = records.get(store)
  if (!jobs) {
    jobs = new Map()
    records.set(store, jobs)
  }
  for (const [id, entry] of jobs)
    if (entry.expiresAt <= Date.now()) jobs.delete(id)
  jobs.set(job.id, { failure, expiresAt: job.expiresAt })
}
export function jobPreviewFailure(store: DocumentJobStore, job: FormatJob) {
  return records.get(store)?.get(job.id)?.failure
}
export function clearPreviewFailure(store: DocumentJobStore, id: string) {
  records.get(store)?.delete(id)
}
