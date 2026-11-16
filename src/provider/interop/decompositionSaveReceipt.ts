import type { Decomposition } from '../../core/document-jobs/decompose/jobDecomposition'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import type { FormatJob } from '../../core/document-jobs/jobTypes'
import type { AgentToolOutcome } from '../../core/llm/toolOutcome'

import { documentJobNextStep } from './documentJobDraftInput'
import { documentJobFileHash } from './documentJobFileHash'
import type { HostContext } from './editorActions'
import type { InternalCommitFacts } from './hostInternalCommitTypes'
import * as modelText from './residualJobText'

/** Two independently read-back files; never confuse this with the output HWPX receipt. */
export async function finalizeDecompositionSave(input: {
  host: HostContext
  store: DocumentJobStore
  job: FormatJob
  pending: NonNullable<Decomposition['pending']>
  facts: InternalCommitFacts
  signal?: AbortSignal
  failed: (cause: string, outcome: AgentToolOutcome) => AgentToolOutcome
}): Promise<AgentToolOutcome> {
  const { host, store, job, pending, facts, signal, failed } = input
  if (job.status.state !== 'ready') throw new Error('Job is not ready.')
  const data = job.status.data

  const outcome = facts.outcome
  if (
    signal?.aborted ||
    outcome.status === 'paused' ||
    outcome.mutation === 'partial' ||
    outcome.mutation === 'unknown'
  )
    return {
      ...outcome,
      terminal: true,
      ...(signal?.aborted ? { status: 'paused' as const } : {}),
    }
  if (outcome.commit?.state !== 'written' || outcome.mutation !== 'applied')
    return failed(
      outcome.status === 'rejected' ? 'rejected' : 'not_written',
      outcome,
    )
  const files = facts.preparation?.writeSet.filter((e) => e.kind === 'file')
  try {
    if (!files || files.length !== 2 || outcome.commit.needsAttention)
      throw new Error('Invalid receipt.')
    for (const file of files)
      if ((await documentJobFileHash(host, file.path)) !== file.sha256Expected)
        throw new Error('Readback mismatch.')
    const template = files.find((f) => f.path === pending.templatePath),
      text = files.find((f) => f.path === pending.textPath)
    if (!template || !text) throw new Error('Invalid pair receipt.')
    data.template = {
      dialect: pending.record.dialect,
      rulesVersion: pending.record.rulesVersion,
      catalogVersion: pending.record.catalogVersion,
      path: pending.templatePath,
      textPath: pending.textPath,
      sha256: template.sha256Expected,
      state: 'as_saved',
      sourcePath: job.samplePath,
      sourceSha256: job.sampleSha256,
    }
    data.decomposition = {
      facts: {
        ...data.decomposition?.facts,
        state: 'saved',
        template_sha256: template.sha256Expected,
        text_sha256: text.sha256Expected,
        templateState: 'as_saved',
        textState: 'as_saved',
      },
    }
    store.transition(job.id, job.conversationId, job.sampleSha256, {
      state: 'ready',
      data: data,
    })
    return {
      ...outcome,
      displayText: JSON.stringify({
        state: 'saved',
        job_id: job.id,
        decomposition: data.decomposition.facts,
        draft_contract: data.draftContract,
        nextStep: documentJobNextStep(job),
      }),
      decompositionReceipt: {
        jobId: job.id,
        template: {
          path: template.path,
          sha256: template.sha256Expected,
          readback: 'verified' as const,
        },
        text: {
          path: text.path,
          sha256: text.sha256Expected,
          readback: 'verified' as const,
        },
      },
    }
  } catch {
    return {
      ...outcome,
      status: 'paused',
      terminal: true,
      retry: { allowed: false },
      displayText: modelText.decompositionReceiptPending(),
    }
  }
}
