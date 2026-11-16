/**
 * A revision-bound location inside a source note.
 *
 * This is deliberately independent from a retrieval score. A location is the
 * stable identity used by execution plans, coverage ledgers, and evidence
 * records; scores belong to RetrievalHit.
 */
export type ChunkLocator = {
  unitId: string
  path: string
  startLine: number
  endLine: number
  headingPath?: string[]
  documentOcrCandidatePages?: number[]
  revisionHash: string
  chunkerVersion?: string
}

export type RetrievalProvenance =
  | 'vector'
  | 'bm25'
  | 'wikilink'
  | 'backlink'
  | 'adjacent'
  | 'shared_tag'
  | 'frontmatter_ref'
  | 'folder_adjacent'

export type RetrievalScores = {
  vector?: number
  bm25?: number
  rerank?: number
  graph?: number
  /** The final legacy/fused score when component scores are unavailable. */
  final?: number
}

/**
 * Retrieval metadata separated from the legacy database row shape.
 *
 * `locator` is the revision-bound identity. `scores` and `provenance` describe
 * how the item was found, while `content` remains an optional payload for
 * callers that already hydrated the result.
 */
export type RetrievalHit = {
  locator: ChunkLocator
  requirementIds?: string[]
  tokenEstimate?: number
  scores: RetrievalScores
  provenance: RetrievalProvenance[]
  content?: string
}
