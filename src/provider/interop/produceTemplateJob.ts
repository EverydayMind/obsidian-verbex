import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import type {
  FormatJob,
  ProductionKey,
} from '../../core/document-jobs/jobTypes'
import { clearPreviewFailure } from '../../core/document-jobs/previewFailure'
import type { AgentToolOutcome } from '../../core/llm/toolOutcome'
import type { ProviderExecutionContext } from '../ProviderRegistry'

import { blockJobDialect, inspectTemplateDialect } from './documentJobDialect'
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
import { templateProductionPreview } from './documentJobProductionPreview'
import { assessDocumentJobReadiness } from './documentJobReadiness'
import { guardDocumentOutput } from './documentOutputGuard'
import { readBoundTemplateDraft } from './draftTemplateBinding'
import type { HostContext } from './editorActions'
import { withHostInternalCommit } from './hostInternalCommit'
import { HostCommitNotStarted } from './hostInternalCommitTypes'
import type { NativeHostOptions } from './hostOptions'

export async function produceTemplateJob(input: {
  host: HostContext
  options: NativeHostOptions
  store: DocumentJobStore
  job: FormatJob
  request: { job_id: string; draft_path: string; output_path: string }
  context: ProviderExecutionContext & {
    conversationId: string
    runId: string
    turnId: string
  }
}): Promise<AgentToolOutcome> {
  const { host, options, store, job, request, context } = input
  if (job.status.state !== 'ready' || !job.status.data.template)
    throw new Error('Template job is not ready.')
  const data = structuredClone(job.status.data),
    template = job.status.data.template
  const draft = await readBoundTemplateDraft(host, request, job)
  if ('fact' in draft) return observed(draft.fact)
  const { pair, problem } = await inspectTemplateDialect(
    host,
    template,
    draft.bytes,
    context.signal,
  )
  if (problem) return observed(blockJobDialect(store, job, problem))
  data.template = {
    ...template,
    sha256: pair.sha256,
    state: pair.templateState,
    rulesVersion: pair.record?.rulesVersion,
    catalogVersion: pair.record?.catalogVersion,
  }
  // The job survives template edits; this invocation is bound to current bytes.
  const key: ProductionKey = {
    jobId: job.id,
    draftPath: request.draft_path,
    draftSha256: draft.sha256,
    templateSha256: pair.sha256,
    outputPath: request.output_path,
  }
  const runtime = options.commitRuntime
  if (!runtime)
    return observed({
      state: 'exporter_commit_not_ready',
      cause: 'commit_disabled',
    })
  const guard = () =>
    guardDocumentOutput({
      app: host.app,
      checkpoints: runtime.checkpoints,
      vaultPath: host.vaultPath,
      locks: runtime.locks,
      providerBusy: host.busy.has('md-to-hwpx'),
      conversationId: context.conversationId,
      path: request.output_path,
    })
  let guarded = await guard()
  if (guarded.state !== 'ready' && guarded.state !== 'output_exists')
    return observed(guardFact(guarded))
  const previous = await store.previousProduction(
    context.conversationId,
    job.sampleSha256,
    key,
    async (path) =>
      (await host.app.vault.adapter.stat(path)) === null
        ? null
        : documentJobFileHash(host, path),
  )
  if (previous.state === 'same') {
    clearPreviewFailure(store, job.id)
    return observed({
      ...previous.receipt,
      duplicate: true,
      output: 'unchanged',
    })
  }
  if (guarded.state !== 'ready') return observed(guardFact(guarded))
  await host.refresh(context.signal)
  const readiness = assessDocumentJobReadiness(host, options, {
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
  const result = await templateProductionPreview({
    host,
    store,
    job,
    request,
    draftSha: draft.sha256,
    source: 'template',
    sourcePath: template.path,
    sourceSha: pair.sha256,
    signal: context.signal,
  })
  if ('fact' in result) return observed(result.fact)
  const { preview } = result
  if (!preview.converts)
    return observed({ state: 'conversion_failed', failure: preview.failure })
  const beforeCheckpoint = async (
    preparation: Parameters<typeof assertNewDerivedOutput>[0],
  ) => {
    assertNewDerivedOutput(preparation, request.output_path)
    if (
      (await documentJobFileHash(host, template.path)) !== pair.sha256 ||
      (await documentJobFileHash(host, request.draft_path)) !== draft.sha256
    )
      throw new HostCommitNotStarted('input_changed')
    guarded = await guard()
    if (guarded.state !== 'ready')
      throw new DocumentOutputBlocked(guardFact(guarded))
  }
  try {
    return await withHostInternalCommit(
      host,
      options,
      {
        providerId: 'md-to-hwpx',
        toolName: 'export_note',
        args: {
          path: request.draft_path,
          expected_note_sha256: draft.sha256,
          expected_template_sha256: pair.sha256,
          outputPath: request.output_path,
        },
        expectedDigest: data.descriptorDigest,
        expectedPolicyRevision: data.policyRevision,
        context,
        beforeCheckpoint: (preparation) =>
          runBeforeDocumentJobCheckpoint(() => beforeCheckpoint(preparation)),
      },
      (facts) =>
        finalizeDocumentProduction({
          host,
          store,
          facts,
          data,
          key,
          sampleSha: job.sampleSha256,
          preview,
          draftMarkdown: new TextDecoder().decode(draft.bytes),
          context,
          previousSha256:
            previous.state === 'output_missing' ? previous.sha256 : undefined,
        }),
    )
  } catch (error) {
    return documentJobCommitFailure(error)
  }
}
