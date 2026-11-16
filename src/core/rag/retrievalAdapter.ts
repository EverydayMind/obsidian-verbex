import type { SelectEmbedding } from '../../database/schema'
import { sha256Hex } from '../../utils/hash'
import { estimateTokens } from '../../utils/llm/estimateTokens'

import type {
  ChunkLocator,
  RetrievalHit,
  RetrievalProvenance,
} from './retrievalTypes'

/** The legacy row-plus-score shape still used by existing consumers. */
export type LegacyQueryResult = Omit<SelectEmbedding, 'embedding'> & {
  similarity: number
}

export type QueryResultAdapterOptions = {
  requirementIds?: readonly string[]
  provenance?: readonly RetrievalProvenance[]
  chunkerVersion?: string
}

function normalizeLineRange(result: LegacyQueryResult): {
  startLine: number
  endLine: number
} {
  const startLine = Number.isInteger(result.metadata.startLine)
    ? Math.max(result.metadata.startLine, 1)
    : 1
  const endLine = Number.isInteger(result.metadata.endLine)
    ? Math.max(result.metadata.endLine, startLine)
    : startLine
  return { startLine, endLine }
}

export async function queryResultToChunkLocator(
  result: LegacyQueryResult,
  options: Pick<QueryResultAdapterOptions, 'chunkerVersion'> = {},
): Promise<ChunkLocator> {
  if (!result.path.trim()) {
    throw new Error('legacy query result path is required')
  }
  const { startLine, endLine } = normalizeLineRange(result)
  const revisionHash =
    result.metadata.revisionHash ?? (await sha256Hex(result.content))
  return {
    unitId: `${result.path}@${revisionHash}:${startLine}-${endLine}`,
    path: result.path,
    startLine,
    endLine,
    revisionHash,
    ...(result.metadata.ocrCandidatePages
      ? { documentOcrCandidatePages: result.metadata.ocrCandidatePages }
      : {}),
    ...(result.metadata.breadcrumb
      ? { headingPath: result.metadata.breadcrumb }
      : {}),
    ...(result.metadata.extractorVersion
      ? { chunkerVersion: result.metadata.extractorVersion }
      : {}),
    ...(options.chunkerVersion
      ? { chunkerVersion: options.chunkerVersion }
      : {}),
  }
}

/**
 * Convert one legacy RAG result without changing its existing consumers.
 *
 * The old row carries only a final `similarity`, not the vector/BM25/rerank
 * components that produced it. That score is therefore recorded as `final`
 * instead of being mislabelled as a component score. An empty provenance list
 * means the legacy row did not preserve source provenance.
 */
export async function queryResultToRetrievalHit(
  result: LegacyQueryResult,
  options: QueryResultAdapterOptions = {},
): Promise<RetrievalHit> {
  if (!Number.isFinite(result.similarity)) {
    throw new Error('legacy query result similarity must be finite')
  }
  const locator = await queryResultToChunkLocator(result, options)
  const requirementIds = options.requirementIds
    ?.map((id) => id.trim())
    .filter((id) => id.length > 0)
  const provenance = [...new Set(options.provenance ?? [])]
  return {
    locator,
    ...(requirementIds && requirementIds.length > 0 ? { requirementIds } : {}),
    tokenEstimate: estimateTokens(result.content),
    scores: { final: result.similarity },
    provenance,
    content: result.content,
  }
}

export async function queryResultsToRetrievalHits(
  results: readonly LegacyQueryResult[],
  options: QueryResultAdapterOptions = {},
): Promise<RetrievalHit[]> {
  return Promise.all(
    results.map((result) => queryResultToRetrievalHit(result, options)),
  )
}
