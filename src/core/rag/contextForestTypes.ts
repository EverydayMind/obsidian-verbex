import type { ChunkLocator } from './retrievalTypes'

export type ContextForestRelationType =
  | 'wikilink'
  | 'backlink'
  | 'frontmatter'
  | 'tag'

export type ContextForestScope = {
  folder?: string
  includePaths?: string[]
  excludePaths?: string[]
  /**
   * Whether daily notes should be excluded. Defaults to `false` so general
   * vault search includes daily notes unless the caller explicitly excludes them.
   */
  excludeDailyNotes?: boolean
}

export type ContextForestParams = {
  query: string
  rootPath?: string
  maxDepth?: number
  maxBranchPerNode?: number
  maxNodes?: number
  includeTags?: boolean
  includeLeafSnippets?: boolean
  mapOnly?: boolean
  tokenBudget?: number
  scope?: ContextForestScope
}

export type NormalizedContextForestParams = {
  query: string
  rootPath?: string
  maxDepth: number
  maxBranchPerNode: number
  maxNodes: number
  includeTags: boolean
  includeLeafSnippets: boolean
  mapOnly: boolean
  tokenBudget: number
  scope: {
    folder?: string
    includePaths: string[]
    excludePaths: string[]
    excludeDailyNotes: boolean
  }
}

export type ContextForestEvidenceKind =
  | 'query_lexical'
  | 'query_vector'
  | 'wikilink'
  | 'backlink'
  | 'frontmatter'
  | 'shared_tag'

export type ContextForestEvidenceItem = {
  kind: ContextForestEvidenceKind
  sourcePath?: string
  targetPath: string
  detail?: string
  locator?: ChunkLocator
  revision?: string
}

/** Plan §5.1/§5.2 terms: edgeWeight=W, effectiveScore=S_candidate(v). */
export type ContextForestEdgeBreakdown = {
  structuralScore: number
  lexicalCosine: number
  denseCosine: number | null
  mixedWeight: number
  edgeWeight: number
  queryFactor: number
  effectiveScore: number
  parentRatio: number
  rootRatio: number
  /** True when an explicit reference raised W from Wmix to H. */
  structuralFloorApplied: boolean
}

export type ContextForestAlternateReach = {
  parentPath: string
  relation: ContextForestRelationType
  effectiveScore: number
}

export type ContextForestNode = {
  path: string
  title: string
  depth: number
  parentPath: string | null
  rootPath: string
  relationToParent: ContextForestRelationType | 'root'
  bidirectionalWithParent: boolean
  frontmatterField?: string
  sharedTags?: string[]
  degree: number
  queryScore: number
  queryScoreObserved: boolean
  anchorScore: number
  pathScore: number
  edgeBreakdown: ContextForestEdgeBreakdown | null
  isDirectCandidate: boolean
  alsoReachedFrom: ContextForestAlternateReach[]
  evidence: ContextForestEvidenceItem[]
  snippet?: string
  heading?: string | null
  locator?: ChunkLocator
  bodyIncluded: boolean
  revision?: string
  children: ContextForestNode[]
}

export type ContextForestDirectCandidate = {
  path: string
  title: string
  lexicalRank: number | null
  lexicalScore: number | null
  vectorRank: number | null
  vectorScore: number | null
  rrfScore: number
  queryScore: number
  queryScoreObserved: boolean
  inForest: boolean
  snippet?: string
  heading?: string | null
  locator?: ChunkLocator
  bodyIncluded: boolean
  revision?: string
  evidence: ContextForestEvidenceItem[]
}

export type ContextForestMergedCandidate = {
  path: string
  title: string
  membership: ('direct' | 'forest')[]
  direct?: ContextForestDirectCandidate
  forest?: ContextForestNode
}

export type ContextForestTruncatedReason =
  | 'max_depth'
  | 'max_branch_per_node'
  | 'max_nodes'
  | 'edge_weight'
  | 'score_drop'
  | 'root_floor'
  | 'neighbor_cap'
  | 'edge_budget'
  | 'queue_budget'
  | 'token_budget'
  | 'cycle_prevented'
  | 'dominated_duplicate'
  | 'revision_mismatch'
  | 'budget_exhausted'
  | 'tag_gate_rejected'

export type ContextForestDiagnostics = {
  lexicalReady: boolean
  vectorReady: boolean
  activeSourceCount: number
  lexicalGeneration: number | null
  scopeFingerprint: string
  allowedDocCount: number
  excludedDocCount: number
  hydratedNoteCount: number
  hydratedBytes: number
  dbQueriesExecuted: number
  representativeRowsLoaded: number
  scanCapExceededPaths: string[]
  stalePathsDropped: string[]
  truncatedCounts: Partial<Record<ContextForestTruncatedReason, number>>
  elapsedMs: number
  timedOut: boolean
}

export type ContextForestResult = {
  query: string
  params: NormalizedContextForestParams
  roots: ContextForestNode[]
  nodes: ContextForestNode[]
  nodesByPath: Record<string, ContextForestNode>
  directCandidates: ContextForestDirectCandidate[]
  mergedCandidates: ContextForestMergedCandidate[]
  diagnostics: ContextForestDiagnostics
}

export const CONTEXT_FOREST_DEFAULTS = {
  maxDepth: 3,
  minMaxDepth: 0,
  maxMaxDepth: 4,
  maxBranchPerNode: 4,
  minMaxBranchPerNode: 1,
  maxMaxBranchPerNode: 8,
  maxNodes: 16,
  minMaxNodes: 1,
  maxMaxNodes: 25,
  tokenBudget: 3200,
  minTokenBudget: 256,
  maxTokenBudget: 16000,
  maxDirectCandidatesPerSource: 30,
  maxRoots: 3,
  rootCandidateRank: 5,
  rrfK: 60,
} as const

/** Plan §5 experimental constants; never model tool arguments (§8.1). */
export const CONTEXT_FOREST_SCORING = {
  denseWeight: 0.35,
  lexicalWeight: 0.25,
  structuralWeight: 0.4,
  minEdgeWeight: 0.35,
  maxEdgeWeight: 0.95,
  tagOnlyMinSignal: 0.2,
  tagStructuralScale: 0.35,
  queryFactorBase: 0.75,
  queryFactorSlope: 0.25,
  parentDropRatio: 0.4,
  rootFloorRatio: 0.25,
} as const

/** Plan §6 per-request work caps for the pure builder. */
export const CONTEXT_FOREST_WORK_BUDGETS = {
  maxNeighborsPerParent: 40,
  maxTagBucketScanPerParent: 200,
  maxEdgeEvaluations: 1000,
  maxQueueInsertions: 1000,
  maxAlternateReaches: 3,
} as const

function clampInt(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function trimmedOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function cleanPathList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(trimmedOrUndefined).filter((p): p is string => Boolean(p))
    : []
}

export function normalizeContextForestParams(
  params: ContextForestParams,
): NormalizedContextForestParams {
  const d = CONTEXT_FOREST_DEFAULTS
  const mapOnly = Boolean(params.mapOnly)
  return {
    query: trimmedOrUndefined(params.query) ?? '',
    rootPath: trimmedOrUndefined(params.rootPath),
    maxDepth: clampInt(
      params.maxDepth,
      d.maxDepth,
      d.minMaxDepth,
      d.maxMaxDepth,
    ),
    maxBranchPerNode: clampInt(
      params.maxBranchPerNode,
      d.maxBranchPerNode,
      d.minMaxBranchPerNode,
      d.maxMaxBranchPerNode,
    ),
    maxNodes: clampInt(
      params.maxNodes,
      d.maxNodes,
      d.minMaxNodes,
      d.maxMaxNodes,
    ),
    includeTags: Boolean(params.includeTags),
    includeLeafSnippets: !mapOnly && Boolean(params.includeLeafSnippets),
    mapOnly,
    tokenBudget: clampInt(
      params.tokenBudget,
      d.tokenBudget,
      d.minTokenBudget,
      d.maxTokenBudget,
    ),
    scope: {
      folder: trimmedOrUndefined(params.scope?.folder),
      includePaths: cleanPathList(params.scope?.includePaths),
      excludePaths: cleanPathList(params.scope?.excludePaths),
      excludeDailyNotes: Boolean(params.scope?.excludeDailyNotes),
    },
  }
}
