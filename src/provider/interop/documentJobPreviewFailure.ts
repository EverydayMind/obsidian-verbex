import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import type { FormatJob } from '../../core/document-jobs/jobTypes'
import {
  jobPreviewFailure,
  recordPreviewFailure,
} from '../../core/document-jobs/previewFailure'
import { stringifyUnknown } from '../../utils/stringifyUnknown'

import { documentJobNextStep } from './documentJobDraftInput'
import { documentJobFileHash } from './documentJobFileHash'
import * as wording from './documentJobPreviewFailureText'
import type { HostContext } from './editorActions'
import { HostInternalReadError } from './hostInternalRead'
import type { JsonObject } from './protocol'

export type PreviewInput = {
  host: HostContext
  store: DocumentJobStore
  job: FormatJob
  request: { job_id: string; draft_path: string; output_path: string }
  draftSha: string
  source: 'template' | 'sample'
  sourcePath: string
  sourceSha: string
  signal?: AbortSignal
}

async function currentHash(
  input: PreviewInput,
  path: string,
  expected: string,
) {
  input.signal?.throwIfAborted()
  try {
    const sha = await documentJobFileHash(input.host, path)
    input.signal?.throwIfAborted()
    return sha === expected ? ('same' as const) : ('changed' as const)
  } catch (error) {
    input.signal?.throwIfAborted()
    if (error instanceof Error && error.name === 'AbortError') throw error
    return 'unavailable' as const
  }
}

export async function documentJobPreviewFailure(
  error: unknown,
  input: PreviewInput,
): Promise<JsonObject> {
  const { store, job, request, signal, source, sourcePath } = input
  signal?.throwIfAborted()
  if (
    !(error instanceof HostInternalReadError) ||
    error.readCause !== 'invalid_response' ||
    error.vaultEvents !== 0 ||
    error.stale
  )
    throw error
  const draft = await currentHash(input, request.draft_path, input.draftSha)
  const other = await currentHash(input, sourcePath, input.sourceSha)
  const fact: JsonObject = {
    state: 'preview_failed',
    code: [...error.code].slice(0, 128).join(''),
    inputs: { draft, [source]: other },
  }
  if (other === 'unavailable') {
    fact.message =
      source === 'template'
        ? wording.templateUnavailable(sourcePath)
        : wording.sampleUnavailable(sourcePath)
  } else if (source === 'sample' && other === 'changed') {
    fact.nextStep = {
      tool: 'prepare_format_reuse',
      arguments: { sample_path: sourcePath },
    }
    fact.message = wording.sampleChanged()
  } else if (draft === 'unavailable') {
    fact.nextStep = documentJobNextStep(job)
    fact.message = wording.draftUnavailable()
  } else if (draft === 'changed' || other === 'changed') {
    fact.nextStep = { tool: 'produce_format_reuse', arguments: request }
    fact.message = wording.inputChanged()
  } else {
    fact.message = wording.unchanged()
    recordPreviewFailure(store, job, {
      code: stringifyUnknown(fact.code),
      draftPath: request.draft_path,
      draftSha256: input.draftSha,
      sourcePath,
      sourceSha256: input.sourceSha,
      at: Date.now(),
    })
  }
  return fact
}

export async function pendingPreviewFailure(
  host: HostContext,
  store: DocumentJobStore,
  job: FormatJob,
  signal?: AbortSignal,
) {
  const failure = jobPreviewFailure(store, job)
  if (!failure) return null
  signal?.throwIfAborted()
  try {
    const draft = await documentJobFileHash(host, failure.draftPath)
    signal?.throwIfAborted()
    const source = await documentJobFileHash(host, failure.sourcePath)
    signal?.throwIfAborted()
    return draft === failure.draftSha256 && source === failure.sourceSha256
      ? {
          preview_failed: { code: failure.code, inputs: 'unchanged' },
          message: wording.pending(),
        }
      : null
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof Error && error.name === 'AbortError') throw error
    return null
  }
}
