import { skipDecompositionSave } from '../../core/document-jobs/decompose/skippedSave'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import { clearPreviewFailure } from '../../core/document-jobs/previewFailure'
import { type AgentToolOutcome, toolFailed } from '../../core/llm/toolOutcome'
import { stringifyUnknown } from '../../utils/stringifyUnknown'
import { validators as compiled } from '../../validation/validators'

import { MAX_COMMIT_BYTES } from './commitProtocol'
import { copyJson } from './descriptorReader'
import { blockJobDialect, draftDialectProblem } from './documentJobDialect'
import { readProduceDraft } from './documentJobDraftInput'
import { documentJobFileHash } from './documentJobFileHash'
import {
  documentJobCommitFailure,
  runBeforeDocumentJobCheckpoint,
} from './documentJobProduceFailure'
import {
  DocumentOutputBlocked,
  assertNewDerivedOutput,
  guardFact,
  observedDocumentJob as observed,
} from './documentJobProduceGuard'
import { finalizeDocumentProduction } from './documentJobProduceReceipt'
import { sampleProductionPreview } from './documentJobProductionPreview'
import { assessDocumentJobReadiness } from './documentJobReadiness'
import { jobStatusResult } from './documentJobStatus'
import { guardDocumentOutput } from './documentOutputGuard'
import { outputPathKey } from './documentOutputPath'
import type { HostContext } from './editorActions'
import { withHostInternalCommit } from './hostInternalCommit'
import { HostCommitNotStarted } from './hostInternalCommitTypes'
import type { NativeHostOptions } from './hostOptions'
import { produceTemplateJob } from './produceTemplateJob'
import * as modelText from './residualJobText'
import { sampleProductionInput } from './sampleProductionInput'

type Request = { job_id: string; draft_path: string; output_path: string }
type Context = Parameters<typeof produceTemplateJob>[0]['context']
const validate = compiled.produce

export class DocumentJobProduce {
  private readonly active = new Set<string>()
  constructor(
    private readonly host: HostContext,
    private readonly options: NativeHostOptions,
    private readonly store: DocumentJobStore,
  ) {}

  async produce(raw: unknown, context: Context): Promise<AgentToolOutcome> {
    const safe = copyJson(raw, {
      maxDepth: 6,
      maxNodes: 100,
      maxBytes: 32 * 1024,
    })
    if (
      !validate(safe) ||
      !context.conversationId ||
      !context.runId ||
      !context.turnId
    )
      throw new Error('Invalid production request or identity.')
    const request = safe as unknown as Request
    const draft = this.host.vaultPath(request.draft_path),
      output = this.host.vaultPath(request.output_path)
    if (
      draft !== request.draft_path ||
      output !== request.output_path ||
      !/\.md$/i.test(draft) ||
      !/\.hwpx$/i.test(output) ||
      outputPathKey(draft) === outputPathKey(output)
    )
      throw new Error(
        'Canonical Markdown draft and new HWPX output paths required.',
      )
    const lock = outputPathKey(output)
    if (this.active.has(lock))
      return observed({ state: 'save_in_progress', path: output })
    this.active.add(lock)
    try {
      return await this.run(request, context)
    } finally {
      this.active.delete(lock)
    }
  }
  private async run(
    request: Request,
    context: Context,
  ): Promise<AgentToolOutcome> {
    const { conversationId, signal } = context
    const samplePath = this.store.sourcePath(request.job_id, conversationId)
    const sampleSha = await documentJobFileHash(this.host, samplePath)
    const job = this.store.getJob(request.job_id, conversationId, sampleSha)
    if (
      job.status.state === 'awaiting_choice' ||
      job.status.state === 'blocked'
    )
      return observed(jobStatusResult(job, this.host))
    if (job.status.state !== 'ready')
      return toolFailed(modelText.formatJobNotReady(), {
        terminal: false,
        retry: { allowed: true },
        mutationScope: 'none',
      })
    if (job.kind === 'template')
      return produceTemplateJob({
        host: this.host,
        options: this.options,
        store: this.store,
        job,
        request,
        context,
      })
    skipDecompositionSave(this.store, job)
    const draft = await readProduceDraft(this.host, request, job)
    if ('fact' in draft) return observed(draft.fact)
    const data = job.status.data,
      draftSha = draft.sha256
    const problem = draftDialectProblem(draft.bytes, data.bundle.dialect)
    if (problem) return observed(blockJobDialect(this.store, job, problem))
    const { derivationSha, bundle, key } = sampleProductionInput(
      job,
      request,
      draftSha,
    )
    const runtime = this.options.commitRuntime
    if (!runtime)
      return observed({
        state: 'exporter_commit_not_ready',
        cause: 'commit_disabled',
      })
    const guard = () =>
      guardDocumentOutput({
        app: this.host.app,
        checkpoints: runtime.checkpoints,
        vaultPath: this.host.vaultPath,
        locks: runtime.locks,
        providerBusy: this.host.busy.has('md-to-hwpx'),
        conversationId,
        path: request.output_path,
      })
    let state = await guard()
    if (state.state !== 'ready' && state.state !== 'output_exists')
      return observed(guardFact(state))
    const previous = await this.store.previousProduction(
      conversationId,
      sampleSha,
      key,
      async (path) => {
        const stat = await this.host.app.vault.adapter.stat(path)
        return stat === null
          ? null
          : documentJobFileHash(this.host, path, MAX_COMMIT_BYTES)
      },
    )
    if (previous.state === 'same') {
      clearPreviewFailure(this.store, job.id)
      return observed({
        ...previous.receipt,
        duplicate: true,
        output: 'unchanged',
      })
    }
    if (previous.state === 'output_changed') {
      state = await guard()
      if (state.state !== 'output_exists')
        return toolFailed(modelText.outputChanged(), {
          terminal: false,
          retry: { allowed: true },
          mutationScope: 'none',
        })
      return observed({
        ...guardFact(state),
        previousProduction: {
          sha256: previous.sha256,
          output: 'output_changed',
        },
      })
    }
    if (state.state === 'output_exists' && previous.state === 'output_missing')
      state = await guard()
    if (state.state !== 'ready') return observed(guardFact(state))
    await this.host.refresh(signal)
    const readiness = assessDocumentJobReadiness(this.host, this.options, {
      descriptorDigest: data.descriptorDigest,
      policyRevision: data.policyRevision,
    })
    if (readiness.state !== 'ready')
      return observed({
        state: 'exporter_commit_not_ready',
        cause:
          readiness.state === 'unavailable'
            ? 'provider_unavailable'
            : readiness.cause,
      })
    const result = await sampleProductionPreview(
      {
        host: this.host,
        store: this.store,
        job,
        request,
        draftSha,
        source: 'sample',
        sourcePath: samplePath,
        sourceSha: stringifyUnknown(bundle.expected_sample_sha256),
        signal,
      },
      bundle,
      derivationSha,
    )
    if ('fact' in result) return observed(result.fact)
    const { preview } = result
    if (!preview.derivable)
      return observed({
        state: 'conversion_failed',
        failure: {
          code: 'derivation_rejected',
          message: modelText.derivationRejected(),
        },
      })
    if (!('converts' in preview))
      throw new Error('Preview did not include conversion facts.')
    if (!preview.converts)
      return observed({
        state: 'conversion_failed',
        failure: {
          code: [...preview.failure.code].slice(0, 128).join(''),
          message: preview.failure.message,
        },
      })
    const beforeCheckpoint = async (
      preparation: Parameters<typeof assertNewDerivedOutput>[0],
    ) => {
      assertNewDerivedOutput(preparation, request.output_path)
      if (
        (await documentJobFileHash(this.host, samplePath)) !== sampleSha ||
        (await documentJobFileHash(this.host, request.draft_path)) !== draftSha
      )
        throw new HostCommitNotStarted('input_changed')
      const last = await guard()
      if (last.state !== 'ready')
        throw new DocumentOutputBlocked(guardFact(last))
    }
    try {
      const outcome = await withHostInternalCommit(
        this.host,
        this.options,
        {
          providerId: 'md-to-hwpx',
          toolName: 'export_note',
          args: {
            path: request.draft_path,
            expected_note_sha256: draftSha,
            derive_from: bundle,
            outputPath: request.output_path,
          },
          expectedDigest: data.descriptorDigest,
          expectedPolicyRevision: data.policyRevision,
          context,
          beforeCheckpoint: (preparation) =>
            runBeforeDocumentJobCheckpoint(() => beforeCheckpoint(preparation)),
        },
        async (facts) =>
          finalizeDocumentProduction({
            host: this.host,
            store: this.store,
            facts,
            data,
            key,
            sampleSha,
            preview,
            draftMarkdown: new TextDecoder().decode(draft.bytes),
            previousSha256:
              previous.state === 'output_missing' ? previous.sha256 : undefined,
            context,
          }),
      )
      if (outcome.status === 'failed' && outcome.mutation === 'none') {
        const latest = await guard()
        if (latest.state === 'output_exists') {
          const { retry: _retry, ...rest } = outcome
          return {
            ...rest,
            status: 'succeeded',
            terminal: false,
            mutationScope: 'none',
            readFacts: { completeness: 'complete' },
            displayText: JSON.stringify(guardFact(latest)),
          }
        }
      }
      return outcome
    } catch (error) {
      return documentJobCommitFailure(error)
    }
  }
}
