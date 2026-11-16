import { emptyDraftFact } from '../../core/document-jobs/draftBody'
import type { FormatJob } from '../../core/document-jobs/jobTypes'
import { sha256HexBytes } from '../../utils/hash'

import { missingDraftMessage } from './documentJobDraftText'
import { documentJobFileBytes } from './documentJobFileHash'
import type { HostContext } from './editorActions'
import type { JsonObject } from './protocol'

export function documentJobNextStep(job: FormatJob) {
  if (job.status.state !== 'ready') throw new Error('Job is not ready.')
  return {
    tool: 'write_file',
    then: 'produce_format_reuse',
    arguments: {
      job_id: job.id,
      draft_path: job.status.data.draftPath,
      output_path: job.status.data.outputPath,
    },
  }
}

export async function readProduceDraft(
  host: HostContext,
  request: { draft_path: string },
  job: FormatJob,
): Promise<{ fact: JsonObject } | { bytes: ArrayBuffer; sha256: string }> {
  const nextStep = documentJobNextStep(job)
  const requested = await host.app.vault.adapter.stat(request.draft_path)
  if (requested === null) {
    const jobDraft =
      request.draft_path === nextStep.arguments.draft_path
        ? null
        : await host.app.vault.adapter.stat(nextStep.arguments.draft_path)
    if (jobDraft !== null && jobDraft.type !== 'file')
      throw new Error('File missing or exceeds the size limit.')
    return {
      fact: {
        state: 'draft_missing',
        draft_path: request.draft_path,
        ...(jobDraft ? { job_draft_exists: true } : {}),
        nextStep: jobDraft
          ? { tool: 'produce_format_reuse', arguments: nextStep.arguments }
          : nextStep,
        message: missingDraftMessage(jobDraft !== null),
      },
    }
  }
  const bytes = await documentJobFileBytes(host, request.draft_path)
  const sha256 = await sha256HexBytes(bytes)
  const fact = emptyDraftFact(request.draft_path, bytes)
  return fact ? { fact } : { bytes, sha256 }
}
