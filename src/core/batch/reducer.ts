import { RequestMessage } from '../../types/llm/request'
import { tokenCount } from '../../utils/llm/token'
import { splitTextIntoChunks } from '../llm/chunking'

export type ReducerStep = (messages: RequestMessage[]) => Promise<string>

export type ReducerProgress = {
  round: number
  index: number
  total: number
}

export type AnalysisVerificationInput = {
  task: string
  draft: string
  mapOutputs: string[]
  sourceLabel?: string
}

export type AnalysisVerificationAdapter = (
  input: AnalysisVerificationInput,
) => Promise<string>

export type GlobalComparisonSignature = {
  atomId: string
  sourcePath: string
  line?: number
  kind: 'term' | 'definition' | 'number' | 'date' | 'cross_check'
  key: string
  value: string
}

export type SignatureConflict = {
  key: string
  kind: GlobalComparisonSignature['kind']
  signatures: GlobalComparisonSignature[]
}

export async function reduceSummaryOutputs(input: {
  task: string
  outputs: string[]
  inputBudget: number
  runStep: ReducerStep
  countTokens?: (text: string) => Promise<number>
  onProgress?: (progress: ReducerProgress) => void
}): Promise<string> {
  const countTokens = input.countTokens ?? tokenCount
  if (input.outputs.length === 0) return ''
  let current = [...input.outputs]
  let round = 0
  while (current.length > 1) {
    round += 1
    const groups = await boundedGroups(
      current,
      input.task,
      input.inputBudget,
      countTokens,
    )
    const next: string[] = []
    for (let index = 0; index < groups.length; index++) {
      input.onProgress?.({
        round,
        index: index + 1,
        total: groups.length,
      })
      next.push(
        await input.runStep([
          {
            role: 'system',
            content:
              'Merge the supplied partial results without dropping facts, provenance, caveats, or unresolved conflicts. Return only the merged result.',
          },
          {
            role: 'user',
            content: `# Task\n${input.task}\n\n# Partials\n${groups[index]
              .map((text, item) => `## Partial ${item + 1}\n${text}`)
              .join('\n\n')}`,
          },
        ]),
      )
    }
    if (next.length >= current.length) {
      const before = await sumTokens(current, countTokens)
      const after = await sumTokens(next, countTokens)
      if (after >= before) {
        throw new Error(
          'Bounded reducer made no progress; refusing an over-budget final merge.',
        )
      }
    }
    current = next
  }
  return current[0]
}

export function reduceFindingOutputs(input: {
  outputs: string[]
  validate: (output: string, index: number) => string[]
}): { text: string; errors: string[] } {
  const accepted: string[] = []
  const errors: string[] = []
  input.outputs.forEach((output, index) => {
    const failures = input.validate(output, index)
    if (failures.length > 0) {
      errors.push(
        ...failures.map((failure) => `slice ${index + 1}: ${failure}`),
      )
    } else if (output.trim()) {
      accepted.push(output.trim())
    }
  })
  return { text: accepted.join('\n\n'), errors }
}

/**
 * M7a analysis adapter: bounded draft reduction followed by the existing
 * sequential-review verification contract supplied by the controller.
 */
export async function reduceAnalysisOutputs(input: {
  task: string
  outputs: string[]
  inputBudget: number
  runStep: ReducerStep
  verification?: AnalysisVerificationAdapter
  sourceLabel?: string
  countTokens?: (text: string) => Promise<number>
}): Promise<string> {
  const draft = await reduceSummaryOutputs(input)
  if (!input.verification || input.outputs.length <= 1) return draft
  return input.verification({
    task: input.task,
    draft,
    mapOutputs: input.outputs,
    sourceLabel: input.sourceLabel,
  })
}

export function findSignatureConflicts(
  signatures: GlobalComparisonSignature[],
): SignatureConflict[] {
  const groups = new Map<string, GlobalComparisonSignature[]>()
  for (const signature of signatures) {
    const groupKey = `${signature.kind}\u0000${signature.key.trim().toLocaleLowerCase()}`
    const group = groups.get(groupKey) ?? []
    group.push(signature)
    groups.set(groupKey, group)
  }
  const conflicts: SignatureConflict[] = []
  for (const group of groups.values()) {
    const values = new Set(
      group.map((signature) => signature.value.trim().toLocaleLowerCase()),
    )
    if (values.size <= 1) continue
    conflicts.push({
      key: group[0].key,
      kind: group[0].kind,
      signatures: group,
    })
  }
  return conflicts
}

export async function verifySignatureConflicts(input: {
  signatures: GlobalComparisonSignature[]
  maxCandidates: number
  reread: (conflict: SignatureConflict) => Promise<string>
}): Promise<{ conflicts: SignatureConflict[]; evidence: string[] }> {
  const conflicts = findSignatureConflicts(input.signatures).slice(
    0,
    Math.max(0, input.maxCandidates),
  )
  const evidence: string[] = []
  for (const conflict of conflicts) evidence.push(await input.reread(conflict))
  return { conflicts, evidence }
}

export async function reduceCorpusOutputs(input: {
  task: string
  bySource: { path: string; outputs: string[] }[]
  inputBudget: number
  runStep: ReducerStep
  countTokens?: (text: string) => Promise<number>
}): Promise<string> {
  const perSource: string[] = []
  for (const source of input.bySource) {
    perSource.push(
      `# ${source.path}\n${await reduceSummaryOutputs({
        task: input.task,
        outputs: source.outputs,
        inputBudget: input.inputBudget,
        runStep: input.runStep,
        countTokens: input.countTokens,
      })}`,
    )
  }
  return reduceSummaryOutputs({
    task: `${input.task}\nCompare and synthesize across source files. Preserve each source path.`,
    outputs: perSource,
    inputBudget: input.inputBudget,
    runStep: input.runStep,
    countTokens: input.countTokens,
  })
}

async function boundedGroups(
  outputs: string[],
  task: string,
  inputBudget: number,
  countTokens: (text: string) => Promise<number>,
): Promise<string[][]> {
  const taskTokens = await countTokens(task)
  const usable = Math.max(128, inputBudget - taskTokens - 256)
  const bounded: string[] = []
  for (const output of outputs) {
    if ((await countTokens(output)) <= usable) bounded.push(output)
    else {
      bounded.push(
        ...(await splitTextIntoChunks(output, {
          maxTokens: usable,
          countTokens,
        })),
      )
    }
  }
  const groups: string[][] = []
  let group: string[] = []
  let tokens = 0
  for (const output of bounded) {
    const outputTokens = await countTokens(output)
    if (group.length > 0 && tokens + outputTokens > usable) {
      groups.push(group)
      group = []
      tokens = 0
    }
    group.push(output)
    tokens += outputTokens
  }
  if (group.length) groups.push(group)
  return groups
}

async function sumTokens(
  texts: string[],
  countTokens: (text: string) => Promise<number>,
): Promise<number> {
  const counts = await Promise.all(texts.map(countTokens))
  return counts.reduce((sum, count) => sum + count, 0)
}
