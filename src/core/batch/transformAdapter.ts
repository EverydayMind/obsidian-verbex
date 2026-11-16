import { RequestMessage } from '../../types/llm/request'
import { sha256Hex } from '../../utils/hash'

import { runBatchJobEngine } from './engine'
import {
  JobStore,
  JobStoreSpec,
  createJobFamilyKey,
  planReusableSlices,
} from './jobStore'
import { SegmenterProfile, segmentSources } from './segmenter'

const FINAL_SLICE_ID = '__stitched__'

export type GenericTransformJobResult = {
  text: string
  jobId: string
  cacheHit: boolean
  reusedSlices: number
  completionCalls: number
  atomCount: number
}

export async function runGenericTransformJob(input: {
  source: { path: string; content: string }
  instruction: string
  profile: SegmenterProfile
  stateAuthority?: 'checklist' | 'jobstore'
  inputBudget: number
  outputBudget: number
  modelId: string
  configHash: string
  contractHash: string
  engineVersion: string
  store: JobStore
  runStep: (messages: RequestMessage[]) => Promise<string>
  now?: () => Date
}): Promise<GenericTransformJobResult> {
  if (input.stateAuthority === 'checklist') {
    throw new Error('Checklist-backed contracts must use the checklist engine')
  }
  const now = input.now ?? (() => new Date())
  const sourceHash = await sha256Hex(input.source.content)
  const familyKey = await createJobFamilyKey({
    paths: [input.source.path],
    task: input.instruction,
    contractHash: input.contractHash,
    modelId: input.modelId,
    configHash: input.configHash,
    engineVersion: input.engineVersion,
  })
  const previous = await input.store.findLatestFamily(familyKey)
  const cached = previous?.slices.get(FINAL_SLICE_ID)
  if (
    previous?.spec.status === 'completed' &&
    previous.spec.sourceSnapshot[0]?.contentHash === sourceHash &&
    cached?.status === 'done' &&
    cached.result !== undefined
  ) {
    return {
      text: cached.result,
      jobId: previous.spec.jobId,
      cacheHit: true,
      reusedSlices: previous.spec.atoms.length,
      completionCalls: 0,
      atomCount: previous.spec.atoms.length,
    }
  }
  const segmented = await segmentSources({
    sources: [input.source],
    profile: input.profile,
    maxTokens: Math.max(
      256,
      Math.min(input.inputBudget - 500, Math.floor(input.outputBudget * 0.8)),
    ),
  })
  const timestamp = now().toISOString()
  const jobId = `transform-${now().getTime()}-${familyKey.slice(0, 12)}`
  const spec: JobStoreSpec = {
    jobId,
    familyKey,
    sourceSnapshot: [{ path: input.source.path, contentHash: sourceHash }],
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'pending',
    atoms: segmented.atoms,
    metadata: { profile: input.profile, operation: 'transform' },
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
    if (result === undefined) continue
    outputs.set(id, result)
    await input.store.appendSlice(jobId, {
      sliceId: id,
      revision: 1,
      status: 'done',
      result,
      updatedAt: timestamp,
    })
  }
  const engine = await runBatchJobEngine({
    stateAuthority: 'jobstore',
    initialState: outputs,
    runAtomic: async (state) => {
      let calls = 0
      for (let index = 0; index < segmented.atoms.length; index++) {
        const atom = segmented.atoms[index]
        if (state.has(atom.id)) continue
        const result = cleanTransformOutput(
          await input.runStep([
            {
              role: 'system',
              content: `Transform atom ${index + 1}/${segmented.atoms.length}. Preserve Markdown structure, facts, ordering, and boundary text. Return only the transformed atom.`,
            },
            {
              role: 'user',
              content: `# Instruction\n${input.instruction}\n\n# Source ${atom.sourcePath} L${atom.startLine}-L${atom.endLine}\n${atom.body}`,
            },
          ]),
        )
        if (!result) throw new Error(`Empty transform atom: ${atom.id}`)
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
  const text = segmented.atoms
    .map((atom) => engine.state.get(atom.id) ?? '')
    .join('\n')
  await input.store.appendSlice(jobId, {
    sliceId: FINAL_SLICE_ID,
    revision: 1,
    status: 'done',
    result: text,
    updatedAt: now().toISOString(),
  })
  await input.store.setStatus(jobId, 'completed')
  await input.store.compact(jobId)
  return {
    text,
    jobId,
    cacheHit: false,
    reusedSlices: reuse.reusableIds.length,
    completionCalls: engine.completionCalls,
    atomCount: segmented.atoms.length,
  }
}

function cleanTransformOutput(text: string): string {
  return text
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
}
