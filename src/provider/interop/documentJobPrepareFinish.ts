import type { App } from 'obsidian'

import { draftContract } from '../../core/document-jobs/draftContract'
import { jobBaseContract } from '../../core/document-jobs/jobBaseContract'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import { readJobTextFacts } from '../../core/document-jobs/jobTextFacts'
import type { FormatJob } from '../../core/document-jobs/jobTypes'
import { getStyleApi } from '../../core/report-style/kordocStyleApi'
import { validateProfile } from '../../core/report-style/schema'
import type { ProfileMachine } from '../../core/report-style/types'

import { documentJobExporterGate } from './documentJobExporterGate'
import { prepareOutputPaths } from './documentJobOutput'
import { PreviewResultTooLarge } from './documentJobPorts'
import type { HostContext } from './editorActions'
import type { NativeHostOptions } from './hostOptions'
import { prepareJobDerivation } from './prepareJobDerivation'
import type { JsonObject } from './protocol'

export async function finishDocumentJob(input: {
  app: App
  host: HostContext
  options: NativeHostOptions
  store: DocumentJobStore
  job: FormatJob
  bodyRef: string
  chosenBy: 'rule' | 'user' | 'model'
  selectedOption?: string
  signal?: AbortSignal
  byteHash: (path: string) => Promise<string>
}): Promise<FormatJob> {
  const {
    app,
    host,
    options,
    store,
    job,
    bodyRef,
    chosenBy,
    selectedOption,
    signal,
    byteHash,
  } = input
  const block = (reason: string, details?: JsonObject) =>
    store.transition(job.id, job.conversationId, job.sampleSha256, {
      state: 'blocked',
      reason,
      ...(details ? { details } : {}),
    })
  await host.refresh(signal)
  const initial = await documentJobExporterGate(host, options, signal)
  if (initial.blocked)
    return block(initial.blocked.reason, initial.blocked.details)
  const readiness = initial.readiness
  const runtime = options.commitRuntime
  const candidates = job.candidates
  if (!readiness || !runtime || !job.measurement || !candidates)
    throw new Error('Job runtime unavailable.')
  const paths = () =>
    prepareOutputPaths({
      app: app,
      checkpoints: runtime.checkpoints,
      vaultPath: host.vaultPath,
      locks: runtime.locks,
      providerBusy: host.busy.has('md-to-hwpx'),
      conversationId: job.conversationId,
      samplePath: job.samplePath,
      outputName: job.outputName,
    })
  let output = await paths()
  if (output.state === 'blocked') return block(output.reason, output.details)
  let derivation
  try {
    derivation = await prepareJobDerivation({
      job,
      options,
      host: host,
      samplePath: job.samplePath,
      snapshot: job.measurement.snapshot,
      candidates: candidates,
      bodyRef,
      bodyChosenBy: chosenBy,
      signal,
    })
  } catch (error) {
    if (error instanceof PreviewResultTooLarge)
      return block('preview_result_too_large')
    throw error
  }
  if (derivation.state === 'blocked')
    return block(derivation.reason, derivation.details)
  if (derivation.state === 'awaiting_choice')
    return store.transition(
      job.id,
      job.conversationId,
      job.sampleSha256,
      derivation,
    )
  store.getJob(job.id, job.conversationId, await byteHash(job.samplePath))
  await host.refresh(signal)
  const gate = await documentJobExporterGate(host, options, signal, readiness)
  if (gate.blocked) return block(gate.blocked.reason, gate.blocked.details)
  output = await paths()
  if (output.state === 'blocked') return block(output.reason, output.details)
  const now = new Date().toISOString()
  const machine: ProfileMachine = {
    schema: 'report-style-profile/1',
    id: job.id.slice(3),
    revision: 1,
    created: now,
    updated: now,
    title: [...(job.samplePath.split('/').pop() ?? job.samplePath)]
      .slice(0, 256)
      .join(''),
    sourcePath: job.samplePath,
    measurementSha256: job.measurement.measurementSha256,
    snapshot: job.measurement.snapshot,
    bindings: derivation.bindings.map(
      ({ leadingSpacerRef: _spacing, ...b }) => b,
    ),
    fixedRegions: [],
    template: null,
  }
  const validated = await validateProfile(JSON.parse(JSON.stringify(machine)))
  let text: Awaited<ReturnType<typeof readJobTextFacts>>
  try {
    text = await readJobTextFacts({
      api: getStyleApi(app),
      path: job.samplePath,
      sourceSha256: job.sampleSha256,
      measurementSha256: job.measurement.measurementSha256,
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    text = { facts: {}, available: false }
  }
  const contract = draftContract(
    validated.snapshot,
    validated.bindings,
    derivation.rolesDropped,
    text,
    derivation.contextsDropped,
    Object.fromEntries(
      Object.entries(candidates.roles).map(([marker, candidates]) => [
        marker,
        candidates[0]?.paragraphs ?? 0,
      ]),
    ),
    jobBaseContract(job, validated.bindings),
    derivation.roleDropReasons,
  )
  output = await paths()
  if (output.state === 'blocked') return block(output.reason, output.details)
  await host.refresh(signal)
  store.getJob(job.id, job.conversationId, await byteHash(job.samplePath))
  const final = await documentJobExporterGate(host, options, signal, readiness)
  if (final.blocked) return block(final.blocked.reason, final.blocked.details)
  const ready = store.transition(job.id, job.conversationId, job.sampleSha256, {
    state: 'ready',
    data: {
      bundle: derivation.bundle,
      rolePrefixes: derivation.rolePrefixes,
      machine: validated,
      draftContract: derivation.extendContract(contract),
      ...(derivation.decomposition
        ? { decomposition: derivation.decomposition }
        : {}),
      ...(derivation.template ? { template: derivation.template } : {}),
      descriptorDigest: readiness.descriptorDigest,
      policyRevision: readiness.policyRevision,
      droppedBindings: derivation.droppedBindings,
      draftPath: output.draftPath,
      outputPath: output.outputPath,
      ...(output.outputRenamed ? { outputRenamed: output.outputRenamed } : {}),
      ...(selectedOption ? { selectedOption, chosenBy } : {}),
    },
  })
  return derivation.template && ready.status.state === 'ready'
    ? store.transition(job.id, job.conversationId, job.sampleSha256, {
        state: 'ready',
        data: ready.status.data,
      })
    : ready
}
