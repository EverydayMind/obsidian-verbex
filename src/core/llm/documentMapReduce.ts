import { RequestMessage } from '../../types/llm/request'
import { sha256Hex } from '../../utils/hash'
import { tokenCount } from '../../utils/llm/token'
import type { ChunkLocator } from '../rag/retrievalTypes'
import { makeCoverageUnitId } from '../routing/coverage'
import {
  type EvidenceRecord,
  type EvidenceRecordProcessingStatus,
  type EvidenceRecordReduction,
  evidenceRecordFromChunk,
  reduceEvidenceRecords,
} from '../routing/evidenceRecords'
import { isCrossDocumentReviewIntent } from '../routing/scopeDecision'

import { splitTextIntoChunks } from './chunking'
import { mapMessages, reduceMessages } from './documentMapReduceMessages'

/**
 * Map-reduce processing of a document larger than the model's input budget
 * (요구사항 2·3).
 *
 * The whole document is guaranteed to be processed: it is split into chunks that
 * each fit the budget, every chunk is analyzed against the user's task (the
 * "map" pass), and the partial results are merged into a single coherent answer
 * (the "reduce" pass, applied hierarchically if the partials themselves overflow
 * the budget). This trades extra LLM calls for completeness, which is the point
 * — no part of the input is silently dropped or truncated.
 *
 * The actual completion call (`runStep`) and token counter are injected so this
 * module is pure and unit-testable without a live provider.
 */

export type MapReduceStepResult = {
  text: string
  finishReason?: string | null
  /** True when the caller exhausted its mechanical continuation limit. */
  truncated?: boolean
}

export type MapReduceStep = (
  messages: RequestMessage[],
) => Promise<string | MapReduceStepResult>
type TokenCounter = (text: string) => Promise<number>

export type MapReduceProgress = {
  phase: 'map' | 'reduce'
  index: number
  total: number
}

export type MapReduceOptions = {
  /** The full document content to process. */
  document: string
  /** The user's task / instruction the document is being processed for. */
  task: string
  /**
   * Maximum input tokens for a single LLM call (chunk + framing). Should already
   * be the model's usable input budget; framing overhead is reserved internally.
   */
  inputTokenBudget: number
  runStep: MapReduceStep
  countTokens?: TokenCounter
  /** Optional source label (e.g. file path) added to the framing for grounding. */
  documentLabel?: string
  onProgress?: (progress: MapReduceProgress) => void
  mode?: 'analysis' | 'evidence'
  /** Cancels at chunk and reduce-batch boundaries. */
  signal?: AbortSignal
}

export type MapReduceResult = {
  finalText: string
  chunkCount: number
  mapOutputs: string[]
  reduceRounds: number
  /** A reduce call was empty or mechanically truncated; map coverage alone is insufficient. */
  reductionIncomplete: boolean
  evidenceRecords: EvidenceRecord[]
  evidenceSummary: EvidenceRecordReduction['summary']
}

// Reserve room for the system framing + task instruction inside each call so the
// chunk itself never pushes the request over the budget.
const FRAMING_OVERHEAD_TOKENS = 600

/**
 * Predict how many map chunks a document will split into, using the same budget
 * math as {@link mapReduceDocument}. Used by the §6.6 cost gate to warn before a
 * genuinely expensive run, without actually running the split.
 */
export function estimateMapChunkCount(
  documentTokens: number,
  inputTokenBudget: number,
  taskTokens: number,
): number {
  const chunkBudget = Math.max(
    256,
    inputTokenBudget - taskTokens - FRAMING_OVERHEAD_TOKENS,
  )
  return Math.max(1, Math.ceil(documentTokens / chunkBudget))
}

/** Route only genuinely cross-dependent reviews through the additional audit. */
export function isSequentialDocumentReviewIntent(
  request: string,
  activeSkills: { cross_document?: boolean; crossDocument?: boolean }[] = [],
): boolean {
  return isCrossDocumentReviewIntent(request, activeSkills)
}

/**
 * Decide which attached files to compress when their *combined* size would crowd
 * the context, even though each one fits on its own (요구사항 2·3 보강).
 *
 * The single-file digest path only triggers on an individually-oversized
 * attachment; several medium files can still sum past the assembly budget and
 * push the lower-priority ones out. This picks files to digest largest-first —
 * reclaiming the most budget per compression — until the verbatim remainder fits
 * `aggregateBudget`, so every attachment still contributes (in full or as a
 * digest) instead of some being silently budget-dropped. A lone attachment is
 * never digested (compressing a single file reclaims nothing); with several
 * files the verbatim `keep` set may end up empty under extreme pressure. Kept
 * files preserve their original order.
 */
export function selectAttachmentsToDigest<T>(
  items: { item: T; tokens: number }[],
  aggregateBudget: number,
): { digest: T[]; keep: T[] } {
  const total = items.reduce((sum, entry) => sum + entry.tokens, 0)
  if (items.length <= 1 || total <= aggregateBudget) {
    return { digest: [], keep: items.map((entry) => entry.item) }
  }
  // Largest first; ties broken by original order so the choice is deterministic.
  const bySize = items
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.tokens - a.tokens || a.index - b.index)
  const digestIndices = new Set<number>()
  let running = total
  for (const entry of bySize) {
    if (running <= aggregateBudget) {
      break
    }
    digestIndices.add(entry.index)
    running -= entry.tokens
  }
  const digest: T[] = []
  const keep: T[] = []
  items.forEach((entry, index) => {
    if (digestIndices.has(index)) {
      digest.push(entry.item)
    } else {
      keep.push(entry.item)
    }
  })
  return { digest, keep }
}

/**
 * Run the map-reduce pass. Returns the merged final text plus metadata. When the
 * document already fits the budget it is processed in a single map call (so the
 * caller gets a uniform result), and reduce is skipped.
 */
export async function mapReduceDocument(
  options: MapReduceOptions,
): Promise<MapReduceResult> {
  const {
    document,
    task,
    inputTokenBudget,
    runStep,
    countTokens = tokenCount,
    documentLabel,
    onProgress,
    mode = 'analysis',
    signal,
  } = options

  const throwIfAborted = (): void => {
    if (signal?.aborted)
      throw new DOMException('Operation aborted', 'AbortError')
  }

  throwIfAborted()
  const taskTokens = await countTokens(task)
  throwIfAborted()
  const chunkBudget = Math.max(
    256,
    inputTokenBudget - taskTokens - FRAMING_OVERHEAD_TOKENS,
  )

  const chunks = await splitTextIntoChunks(document, {
    maxTokens: chunkBudget,
    countTokens,
  })
  throwIfAborted()
  const documentPath = documentLabel ?? '<inline-document>'
  const revisionHash = await sha256Hex(document)

  if (chunks.length === 0) {
    const unit = chunkLocatorFor({
      path: documentPath,
      revisionHash,
      startLine: 1,
      endLine: 1,
    })
    const evidenceRecords = [evidenceRecordFromChunk(unit, 'input_empty')]
    const reduction = reduceEvidenceRecords({ records: evidenceRecords })
    return {
      finalText: '',
      chunkCount: 0,
      mapOutputs: [],
      reduceRounds: 0,
      reductionIncomplete: false,
      evidenceRecords,
      evidenceSummary: reduction.summary,
    }
  }

  // Map: process each chunk against the task.
  const mapOutputs: string[] = []
  const evidenceRecords: EvidenceRecord[] = []
  let searchOffset = 0
  for (let i = 0; i < chunks.length; i++) {
    throwIfAborted()
    onProgress?.({ phase: 'map', index: i + 1, total: chunks.length })
    const chunkOffset = document.indexOf(chunks[i], searchOffset)
    const safeOffset = chunkOffset >= 0 ? chunkOffset : searchOffset
    const startLine = document.slice(0, safeOffset).split('\n').length
    const endLine = startLine + chunks[i].split('\n').length - 1
    searchOffset = safeOffset + chunks[i].length
    const unit = chunkLocatorFor({
      path: documentPath,
      revisionHash,
      startLine,
      endLine,
    })
    let stepResult: MapReduceStepResult
    try {
      stepResult = normalizeStepResult(
        await runStep(
          mapMessages(
            task,
            chunks[i],
            i + 1,
            chunks.length,
            documentLabel,
            mode,
            startLine,
            endLine,
          ),
        ),
      )
    } catch {
      throwIfAborted()
      mapOutputs.push('')
      evidenceRecords.push(evidenceRecordFromChunk(unit, 'protocol_error'))
      continue
    }
    throwIfAborted()
    mapOutputs.push(stepResult.text)
    const processingStatus: EvidenceRecordProcessingStatus =
      stepResult.truncated || stepResult.finishReason === 'length'
        ? 'truncated'
        : stepResult.text.trim().length === 0
          ? 'output_empty'
          : 'done'
    evidenceRecords.push(evidenceRecordFromChunk(unit, processingStatus))
  }

  const reducibleOutputs = mapOutputs.filter(
    (output) => output.trim().length > 0,
  )
  if (reducibleOutputs.length === 0) {
    const reduction = reduceEvidenceRecords({ records: evidenceRecords })
    return {
      finalText: '',
      chunkCount: chunks.length,
      mapOutputs,
      reduceRounds: 0,
      reductionIncomplete: false,
      evidenceRecords,
      evidenceSummary: reduction.summary,
    }
  }

  if (reducibleOutputs.length === 1) {
    const reduction = reduceEvidenceRecords({ records: evidenceRecords })
    return {
      finalText: reducibleOutputs[0],
      chunkCount: chunks.length,
      mapOutputs,
      reduceRounds: 0,
      reductionIncomplete: false,
      evidenceRecords,
      evidenceSummary: reduction.summary,
    }
  }

  // Reduce: merge partials hierarchically until a single result remains and it
  // fits within the budget.
  let current = reducibleOutputs
  let round = 0
  let noProgressRounds = 0
  let reductionIncomplete = false
  while (current.length > 1) {
    throwIfAborted()
    round += 1
    const batches = await batchByBudget(current, task, chunkBudget, countTokens)
    const merged: string[] = []
    for (let i = 0; i < batches.length; i++) {
      throwIfAborted()
      onProgress?.({ phase: 'reduce', index: i + 1, total: batches.length })
      const step = normalizeStepResult(
        await runStep(
          reduceMessages(task, batches[i], round, documentLabel, mode),
        ),
      )
      if (!step.text.trim() || step.truncated || step.finishReason === 'length')
        reductionIncomplete = true
      merged.push(step.text)
      throwIfAborted()
    }
    // Never force every partial into one over-budget request. Oversized
    // partials are split by batchByBudget before this round; if the provider
    // still emits as many large outputs as it consumed, fail explicitly rather
    // than looping or bypassing the input gate.
    if (merged.length >= current.length && merged.length > 1) {
      const [beforeTokens, afterTokens] = await Promise.all([
        sumTokens(current, countTokens),
        sumTokens(merged, countTokens),
      ])
      noProgressRounds = afterTokens >= beforeTokens ? noProgressRounds + 1 : 0
      if (noProgressRounds >= 2) {
        throw new Error(
          'Map-reduce could not reduce its partials within the input budget. Refusing an over-budget forced merge.',
        )
      }
    } else {
      noProgressRounds = 0
    }
    current = merged
  }

  const reduction = reduceEvidenceRecords({ records: evidenceRecords })
  return {
    finalText: current[0],
    chunkCount: chunks.length,
    mapOutputs,
    reduceRounds: round,
    reductionIncomplete,
    evidenceRecords,
    evidenceSummary: reduction.summary,
  }
}

function normalizeStepResult(
  result: string | MapReduceStepResult,
): MapReduceStepResult {
  return typeof result === 'string' ? { text: result } : result
}

function chunkLocatorFor(input: {
  path: string
  revisionHash: string
  startLine: number
  endLine: number
}): ChunkLocator {
  return {
    unitId: makeCoverageUnitId(
      input.path,
      input.revisionHash,
      input.startLine,
      input.endLine,
    ),
    path: input.path,
    startLine: input.startLine,
    endLine: input.endLine,
    revisionHash: input.revisionHash,
    chunkerVersion: 'document-map-reduce-v1',
  }
}

async function sumTokens(
  texts: string[],
  countTokens: TokenCounter,
): Promise<number> {
  const counts = await Promise.all(texts.map((text) => countTokens(text)))
  return counts.reduce((sum, count) => sum + count, 0)
}

/**
 * Group consecutive partial results into batches whose combined token count
 * stays within `budget`, so each reduce call fits the model's input window. A
 * single partial larger than the budget gets its own batch (it will be merged
 * with the running result on a later round).
 */
async function batchByBudget(
  partials: string[],
  task: string,
  budget: number,
  countTokens: TokenCounter,
): Promise<string[][]> {
  const taskTokens = await countTokens(task)
  const usable = Math.max(256, budget - taskTokens)

  const boundedPartials: string[] = []
  for (const partial of partials) {
    const tokens = await countTokens(partial)
    if (tokens <= usable) {
      boundedPartials.push(partial)
      continue
    }
    boundedPartials.push(
      ...(await splitTextIntoChunks(partial, {
        maxTokens: usable,
        countTokens,
      })),
    )
  }

  const batches: string[][] = []
  let batch: string[] = []
  let batchTokens = 0
  for (const partial of boundedPartials) {
    const tokens = await countTokens(partial)
    if (batch.length > 0 && batchTokens + tokens > usable) {
      batches.push(batch)
      batch = []
      batchTokens = 0
    }
    batch.push(partial)
    batchTokens += tokens
  }
  if (batch.length > 0) {
    batches.push(batch)
  }
  return batches
}
