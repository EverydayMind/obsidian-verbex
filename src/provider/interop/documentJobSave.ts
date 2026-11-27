import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import type { FormatJob } from '../../core/document-jobs/jobTypes'
import { validDocumentJobs } from '../../core/document-jobs/validJobs'
import { type AgentToolOutcome, toolFailed } from '../../core/llm/toolOutcome'
import { validators as compiled } from '../../validation/validators'
import type { ProviderExecutionContext } from '../providerTurnTypes'

import {
  assertDecompositionWriteSet,
  decompositionPathsFree,
} from './decompositionSaveGuard'
import { finalizeDecompositionSave } from './decompositionSaveReceipt'
import { copyJson } from './descriptorReader'
import { documentJobNextStep } from './documentJobDraftInput'
import { documentJobFileHash } from './documentJobFileHash'
import { documentJobCommitFailure } from './documentJobProduceFailure'
import { assessDocumentJobReadiness } from './documentJobReadiness'
import { jobNotReady } from './documentJobSaveNotReady'
import type { HostContext } from './editorActions'
import { withHostInternalCommit } from './hostInternalCommit'
import { HostCommitNotStarted } from './hostInternalCommitTypes'
import type { NativeHostOptions } from './hostOptions'
import * as modelText from './residualJobText'

const validate = compiled.save
type Context = ProviderExecutionContext & {
  conversationId: string
  runId: string
  turnId: string
}
const stoppedSave = (): AgentToolOutcome => ({
  status: 'paused',
  terminal: true,
  mutation: 'none',
  mutationScope: 'none',
  retry: { allowed: false },
  displayText: modelText.decompositionStopped(),
})
export class DocumentJobSave {
  private readonly active = new Set<string>()
  constructor(
    private readonly host: HostContext,
    private readonly options: NativeHostOptions,
    private readonly store: DocumentJobStore,
  ) {}

  async save(raw: unknown, context: Context): Promise<AgentToolOutcome> {
    if (context.signal?.aborted) return stoppedSave()
    const safe = copyJson(raw, { maxDepth: 4, maxNodes: 10, maxBytes: 1024 })
    if (
      !validate(safe) ||
      !context.conversationId ||
      !context.runId ||
      !context.turnId
    )
      throw new Error('Invalid save request or identity.')
    const { job_id } = safe as { job_id: string }
    const [job] = await validDocumentJobs({
      store: this.store,
      conversationId: context.conversationId,
      jobId: job_id,
      hash: (path) => documentJobFileHash(this.host, path),
      signal: context.signal,
    }).catch((error) => {
      if (!context.signal?.aborted) throw error
      return []
    })
    if (context.signal?.aborted) return stoppedSave()
    if (!job) throw new Error('Decomposition job unavailable.')
    if (job.status.state !== 'ready') return jobNotReady(job)
    if (this.active.has(job.id))
      return toolFailed('Decomposition save already running.', {
        terminal: false,
        mutationScope: 'none',
      })
    this.active.add(job.id)
    try {
      return await this.run(job, context)
    } finally {
      this.active.delete(job.id)
    }
  }
  private async run(
    job: FormatJob,
    context: Context,
  ): Promise<AgentToolOutcome> {
    if (job.status.state !== 'ready') throw new Error('Job is not ready.')
    const data = job.status.data
    const pending = JSON.parse(
      JSON.stringify(data.decomposition?.pending ?? null),
    ) as NonNullable<NonNullable<typeof data.decomposition>['pending']> | null
    if (!pending)
      return {
        status: 'succeeded',
        terminal: false,
        mutation: 'none',
        mutationScope: 'none',
        displayText: JSON.stringify({
          state: data.decomposition?.facts.state ?? 'not_saved',
          job_id: job.id,
          message: modelText.noPendingDecomposition(),
          nextStep: documentJobNextStep(job),
          decomposition: data.decomposition?.facts,
        }),
      }
    const failed = (
      cause: string,
      outcome: AgentToolOutcome,
    ): AgentToolOutcome => {
      data.decomposition = {
        facts: { ...data.decomposition?.facts, state: 'not_saved', cause },
      }
      this.store.transition(job.id, job.conversationId, job.sampleSha256, {
        state: 'ready',
        data: data,
      })
      return {
        ...outcome,
        terminal: false,
        displayText: JSON.stringify({
          state: 'not_saved',
          job_id: job.id,
          decomposition: data.decomposition.facts,
          draft_contract: data.draftContract,
          nextStep: documentJobNextStep(job),
        }),
      }
    }
    let enteredCommit = false
    try {
      if (context.signal?.aborted) return stoppedSave()
      if (!(await decompositionPathsFree(this.host, pending)))
        return failed(
          'name_conflict',
          toolFailed('name_conflict', { mutationScope: 'none' }),
        )
      await this.host.refresh(context.signal)
      const readiness = assessDocumentJobReadiness(
        this.host,
        this.options,
        undefined,
        'derive_template',
      )
      if (readiness.state !== 'ready')
        return failed(
          readiness.state === 'unavailable'
            ? 'provider_unavailable'
            : readiness.cause,
          toolFailed('derive_template is not ready.', {
            mutationScope: 'none',
          }),
        )
      enteredCommit = true
      return await withHostInternalCommit(
        this.host,
        this.options,
        {
          providerId: 'md-to-hwpx',
          toolName: 'derive_template',
          context,
          expectedDigest: readiness.descriptorDigest,
          expectedPolicyRevision: readiness.policyRevision,
          args: {
            derive_from: pending.bundle,
            markdown: pending.markdown,
            expected_markdown_sha256: pending.markdownSha256,
            template_output_path: pending.templatePath,
            text_output_path: pending.textPath,
            record: pending.record,
          },
          beforeCheckpoint: async (preparation) => {
            assertDecompositionWriteSet(preparation, pending)
            if (!(await decompositionPathsFree(this.host, pending)))
              throw new HostCommitNotStarted('name_conflict')
            if (
              (await documentJobFileHash(this.host, job.samplePath)) !==
              job.sampleSha256
            )
              throw new HostCommitNotStarted('input_changed')
            context.signal?.throwIfAborted()
          },
        },
        (facts) =>
          finalizeDecompositionSave({
            host: this.host,
            store: this.store,
            job,
            pending,
            facts,
            signal: context.signal,
            failed,
          }),
      )
    } catch (error) {
      if (context.signal?.aborted)
        return enteredCommit
          ? {
              ...documentJobCommitFailure(error),
              status: 'paused',
              terminal: true,
            }
          : stoppedSave()
      if (error instanceof HostCommitNotStarted)
        return failed(
          error.code,
          toolFailed(error.code, { mutationScope: 'none' }),
        )
      return enteredCommit
        ? documentJobCommitFailure(error)
        : failed(
            'preflight_failed',
            toolFailed('preflight_failed', { mutationScope: 'none' }),
          )
    }
  }
}
