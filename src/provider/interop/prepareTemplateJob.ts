import { dialectProblem } from '../../core/document-jobs/decompose/dialectPolicy'
import { decompositionDraftContract } from '../../core/document-jobs/decompose/draftContract'
import { rolePrefixes } from '../../core/document-jobs/decompose/v2Guidance'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import { stripTemplateSuffix } from '../../i18n/noteFormats'

import { prepareOutputPaths } from './documentJobOutput'
import { assessDocumentJobReadiness } from './documentJobReadiness'
import type { HostContext } from './editorActions'
import type { NativeHostOptions } from './hostOptions'
import { retiredTemplateJob } from './retiredTemplateJob'
import { readTemplateJobPair } from './templateJobInput'

export async function prepareTemplateJob(input: {
  host: HostContext
  options: NativeHostOptions
  store: DocumentJobStore
  path: string
  conversationId: string
  outputName?: string
  signal?: AbortSignal
}) {
  const { host, path, options, signal } = input
  if (host.vaultPath(path) !== path) throw new Error('Canonical path required.')
  const inspected = await readTemplateJobPair(host, path, signal)
  if (!inspected) return null
  if ('retiredInput' in inspected)
    return retiredTemplateJob({
      ...input,
      ...inspected.retiredInput,
      templatePath: path,
    })
  const { pair, supplied } = inspected
  if (pair.recordRetired || supplied?.['hwpx-dialect'] === 'hwpx-exporter-md/1')
    return retiredTemplateJob({
      ...input,
      sha256: pair.sha256,
      templatePath: pair.path,
      source: pair.recordRetired?.sourcePath ?? pair.record?.sourcePath,
    })
  if (!pair.record) return null
  const meta = supplied ?? pair.frontmatter
  const problem =
    dialectProblem(meta['hwpx-dialect'], pair.record.dialect) ??
    ((supplied &&
      supplied['hwpx-decomposition'] !== pair.record.decompositionId) ||
    pair.textState === 'pair_mismatch'
      ? {
          reason: 'pair_mismatch',
          details: { action: 'prepare_matching_pair' },
        }
      : null)
  if (problem) {
    const job = input.store.createJob({
      conversationId: input.conversationId,
      kind: 'template',
      samplePath: pair.record.sourcePath,
      sampleSha256: pair.record.sourceSha256,
      apiVersion: 1,
    })
    return input.store.transition(
      job.id,
      job.conversationId,
      job.sampleSha256,
      {
        state: 'blocked',
        ...problem,
        details: { ...problem.details, template_path: pair.path },
      },
    )
  }
  await host.refresh(signal)
  const readiness = assessDocumentJobReadiness(host, options)
  if (readiness.state !== 'ready' || !options.commitRuntime)
    throw new Error('exporter_commit_not_ready')
  const output = await prepareOutputPaths({
    app: host.app,
    checkpoints: options.commitRuntime.checkpoints,
    vaultPath: host.vaultPath,
    locks: options.commitRuntime.locks,
    providerBusy: host.busy.has('md-to-hwpx'),
    conversationId: input.conversationId,
    samplePath: stripTemplateSuffix(pair.path),
    outputName: input.outputName,
  })
  if (output.state !== 'ready') throw new Error(output.reason)
  signal?.throwIfAborted()
  return input.store.createJob(
    {
      conversationId: input.conversationId,
      kind: 'template',
      samplePath: pair.record.sourcePath,
      sampleSha256: pair.record.sourceSha256,
      apiVersion: 1,
      outputName: input.outputName,
    },
    {
      bundle: {},
      rolePrefixes: rolePrefixes(pair.markers, pair.prefixes),
      machine: null,
      draftContract: decompositionDraftContract({
        dialect: pair.record.dialect,
        markers: pair.markers,
        prefixes: pair.prefixes,
        markdown: pair.markdown,
        meta: pair.frontmatter,
        templatePath: pair.path,
        textPath: pair.textPath,
      }),
      descriptorDigest: readiness.descriptorDigest,
      policyRevision: readiness.policyRevision,
      droppedBindings: [],
      draftPath: output.draftPath,
      outputPath: output.outputPath,
      ...(output.outputRenamed ? { outputRenamed: output.outputRenamed } : {}),
      template: {
        dialect: pair.record.dialect,
        rulesVersion: pair.record.rulesVersion,
        catalogVersion: pair.record.catalogVersion,
        path: pair.path,
        sha256: pair.sha256,
        textPath: pair.textPath,
        state: pair.templateState,
        sourcePath: pair.record.sourcePath,
        sourceSha256: pair.record.sourceSha256,
      },
      decomposition: {
        facts: {
          state: 'reused',
          text_path: pair.textPath,
          template_path: pair.path,
          templateState: pair.templateState,
          textState: pair.textState,
          documentFidelity: 'not_measured_at_runtime',
        },
      },
    },
  )
}
