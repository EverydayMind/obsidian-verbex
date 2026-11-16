import { RequestMessage } from '../../types/llm/request'
import { sha256Hex } from '../../utils/hash'
import { makeCoverageUnitId } from '../routing/coverage'
import {
  type EvidenceCoverageSummary,
  type EvidenceRecord,
  mapCoverageFactToEvidenceRecord,
  reduceEvidenceRecords,
} from '../routing/evidenceRecords'
import { JobFamilyKey, SourceSnapshot } from '../routing/scopeDecision'

import { runBatchJobEngine } from './engine'
import {
  JobStore,
  JobStoreSpec,
  createJobFamilyKey,
  planReusableSlices,
} from './jobStore'
import {
  AnalysisVerificationAdapter,
  ReducerStep,
  reduceAnalysisOutputs,
} from './reducer'
import { SegmenterProfile, segmentSources } from './segmenter'

const REDUCED_SLICE_ID = '__reduced__'

export type GenericAnalysisJobResult = {
  text: string
  jobId: string
  cacheHit: boolean
  reusedSlices: number
  completionCalls: number
  atomCount: number
  sourceSnapshot: SourceSnapshot
  evidenceRecords: EvidenceRecord[]
  evidenceSummary: EvidenceCoverageSummary
}

export async function runGenericAnalysisJob(input: {
  sources: { path: string; content: string }[]
  task: string
  profile: SegmenterProfile
  stateAuthority?: 'checklist' | 'jobstore'
  inputBudget: number
  modelId: string
  configHash: string
  contractHash: string
  engineVersion: string
  store: JobStore
  runMapStep: ReducerStep
  runReduceStep: ReducerStep
  verification?: AnalysisVerificationAdapter
  now?: () => Date
}): Promise<GenericAnalysisJobResult> {
  if (input.stateAuthority === 'checklist') {
    throw new Error('Checklist-backed contracts must use the checklist engine')
  }
  const now = input.now ?? (() => new Date())
  const sourceSnapshot = await Promise.all(
    input.sources.map(async (source) => ({
      path: source.path,
      contentHash: await sha256Hex(source.content),
    })),
  )
  const familyKey: JobFamilyKey = await createJobFamilyKey({
    paths: input.sources.map((source) => source.path),
    task: input.task,
    contractHash: input.contractHash,
    modelId: input.modelId,
    configHash: input.configHash,
    engineVersion: input.engineVersion,
  })
  const previous = await input.store.findLatestFamily(familyKey)
  const exactSnapshot =
    previous &&
    JSON.stringify(previous.spec.sourceSnapshot) ===
      JSON.stringify(sourceSnapshot)
  const cachedReduced = previous?.slices.get(REDUCED_SLICE_ID)
  if (
    exactSnapshot &&
    previous?.spec.status === 'completed' &&
    cachedReduced?.status === 'done' &&
    cachedReduced.result !== undefined
  ) {
    const evidence = buildGenericEvidenceRecords({
      jobId: previous.spec.jobId,
      atoms: previous.spec.atoms,
      sourceSnapshot,
      slices: previous.slices,
    })
    return {
      text: cachedReduced.result,
      jobId: previous.spec.jobId,
      cacheHit: true,
      reusedSlices: previous.spec.atoms.length,
      completionCalls: 0,
      atomCount: previous.spec.atoms.length,
      sourceSnapshot,
      evidenceRecords: evidence.records,
      evidenceSummary: evidence.summary,
    }
  }

  const segmented = await segmentSources({
    sources: input.sources,
    profile: input.profile,
    maxTokens: Math.max(256, input.inputBudget - 600),
  })
  const jobId = `batch-${now().getTime()}-${familyKey.slice(0, 12)}`
  const timestamp = now().toISOString()
  const spec: JobStoreSpec = {
    jobId,
    familyKey,
    sourceSnapshot,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'pending',
    atoms: segmented.atoms,
    metadata: { profile: input.profile },
  }
  await input.store.create(spec)
  const reuse = previous
    ? planReusableSlices({
        profile: input.profile,
        previousAtoms: previous.spec.atoms,
        nextAtoms: segmented.atoms,
        previousSlices: previous.slices,
      })
    : { reusableIds: [], pendingIds: segmented.atoms.map((atom) => atom.id) }
  const outputs = new Map<string, string>()
  for (const id of reuse.reusableIds) {
    const result = previous?.slices.get(id)?.result
    if (result !== undefined) {
      outputs.set(id, result)
      await input.store.appendSlice(jobId, {
        sliceId: id,
        revision: 1,
        status: 'done',
        result,
        packetDeps: previous?.slices.get(id)?.packetDeps,
        updatedAt: timestamp,
      })
    }
  }

  const engine = await runBatchJobEngine({
    stateAuthority: 'jobstore',
    initialState: outputs,
    runAtomic: async (state) => {
      let calls = 0
      for (const atom of segmented.atoms) {
        if (state.has(atom.id)) continue
        const result = await input.runMapStep(mapMessages(input.task, atom))
        calls += 1
        state.set(atom.id, result)
        await input.store.appendSlice(jobId, {
          sliceId: atom.id,
          revision: 1,
          status: 'done',
          result,
          updatedAt: now().toISOString(),
        })
      }
      return {
        state,
        value: state,
        completionCalls: calls,
        interrupted: false,
      }
    },
  })
  const orderedOutputs = segmented.atoms.map(
    (atom) => engine.state.get(atom.id) ?? '',
  )
  let reduceCalls = 0
  const text = await reduceAnalysisOutputs({
    task: input.task,
    outputs: orderedOutputs,
    inputBudget: input.inputBudget,
    runStep: async (messages) => {
      reduceCalls += 1
      return input.runReduceStep(messages)
    },
    verification: input.verification,
    sourceLabel: input.sources.map((source) => source.path).join(', '),
  })
  await input.store.appendSlice(jobId, {
    sliceId: REDUCED_SLICE_ID,
    revision: 1,
    status: 'done',
    result: text,
    updatedAt: now().toISOString(),
  })
  await input.store.setStatus(jobId, 'completed')
  await input.store.compact(jobId)
  const evidence = buildGenericEvidenceRecords({
    jobId,
    atoms: segmented.atoms,
    sourceSnapshot,
    slices: engine.state,
  })
  return {
    text,
    jobId,
    cacheHit: false,
    reusedSlices: reuse.reusableIds.length,
    completionCalls: engine.completionCalls + reduceCalls,
    atomCount: segmented.atoms.length,
    sourceSnapshot,
    evidenceRecords: evidence.records,
    evidenceSummary: evidence.summary,
  }
}

function buildGenericEvidenceRecords(input: {
  jobId: string
  atoms: {
    id: string
    sourcePath: string
    startLine: number
    endLine: number
  }[]
  sourceSnapshot: SourceSnapshot
  slices: Map<string, { status: string; result?: string }> | Map<string, string>
}): { records: EvidenceRecord[]; summary: EvidenceCoverageSummary } {
  const hashesByPath = new Map(
    input.sourceSnapshot.map((source) => [source.path, source.contentHash]),
  )
  const records = input.atoms.flatMap((atom) => {
    const revisionHash = hashesByPath.get(atom.sourcePath)
    if (!revisionHash) return []
    const unit = {
      unitId: makeCoverageUnitId(
        atom.sourcePath,
        revisionHash,
        atom.startLine,
        atom.endLine,
      ),
      path: atom.sourcePath,
      startLine: atom.startLine,
      endLine: atom.endLine,
      revisionHash,
      chunkerVersion: 'segmenter-v1',
    }
    const slice = input.slices.get(atom.id)
    const status = typeof slice === 'string' ? 'done' : slice?.status
    if (status !== 'done') return []
    const output = typeof slice === 'string' ? slice : slice?.result
    const processingStatus =
      output?.trim().length === 0 ? 'output_empty' : 'done'
    const record = mapCoverageFactToEvidenceRecord({
      ...unit,
      processingStatus,
      ...(output !== undefined
        ? { outputRef: `jobstore:${input.jobId}:${atom.id}` }
        : {}),
    })
    return record ? [record] : []
  })
  const reduction = reduceEvidenceRecords({
    records,
    plannedUnitIds: input.atoms.flatMap((atom) => {
      const revisionHash = hashesByPath.get(atom.sourcePath)
      return revisionHash
        ? [
            makeCoverageUnitId(
              atom.sourcePath,
              revisionHash,
              atom.startLine,
              atom.endLine,
            ),
          ]
        : []
    }),
  })
  return reduction
}

function mapMessages(
  task: string,
  atom: {
    id: string
    sourcePath: string
    startLine: number
    endLine: number
    body: string
  },
): RequestMessage[] {
  return [
    {
      role: 'system',
      content:
        'Analyze exactly the supplied document atom for the user task. Preserve source path and line provenance. Do not infer that unseen atoms are absent.',
    },
    {
      role: 'user',
      content: `# Task\n${task}\n\n# Atom ${atom.id}\nSource: ${atom.sourcePath} L${atom.startLine}-L${atom.endLine}\n\n${atom.body}`,
    },
  ]
}
