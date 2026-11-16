import { normalizePath } from 'obsidian'

import type { DocumentJobPending } from '../../context/documentJobPendingFacts'
import type { HostPrepareResult } from '../../core/document-jobs/hostInitiatedPrepare'
import type { FormatJob } from '../../core/document-jobs/jobTypes'

import {
  type DocumentJobTurnPolicy,
  documentJobTurnPolicy,
} from './documentJobTurnPolicy'

export function documentJobFormatSources(
  jobs: readonly FormatJob[],
  pending: readonly DocumentJobPending[],
  policy: DocumentJobTurnPolicy,
  result: HostPrepareResult,
): string[] {
  const explicitIds = new Set(
    pending
      .filter((job) => job.trigger === 'explicit')
      .map((job) => job.job_id),
  )
  const preparedId =
    policy.intended &&
    (result.execution === 'executed' || result.execution === 'reused')
      ? (result.existingJob?.id ?? result.result?.job_id)
      : undefined
  const paths = new Set<string>()
  for (const job of jobs) {
    if (!explicitIds.has(job.id) && job.id !== preparedId) continue
    const data = job.status.state === 'ready' ? job.status.data : undefined
    for (const path of [
      job.samplePath,
      data?.draftContract.reference_text_path,
      data?.decomposition?.facts.text_path,
      data?.template?.path,
      data?.decomposition?.facts.template_path,
      job.status.state === 'blocked'
        ? job.status.details?.template_path
        : undefined,
    ]) {
      if (typeof path === 'string' && path) paths.add(normalizePath(path))
    }
  }
  return [...paths]
}

export function documentJobSamplePaths(
  jobs: readonly FormatJob[],
  result: HostPrepareResult,
): string[] {
  return [
    ...new Set([
      ...jobs.map((job) => job.samplePath),
      ...(result.samplePath ? [result.samplePath] : []),
    ]),
  ]
}

export function emptyDocumentJobPolicy() {
  return documentJobTurnPolicy({
    request: '',
    referencedHwp: 'none',
    activeJob: false,
  })
}
