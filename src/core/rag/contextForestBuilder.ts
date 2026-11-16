import {
  type FusedDirectCandidateScore,
  type RawSourceCandidate,
  buildTopTfIdfVector,
  computeCorpusIdf,
  computeDenseBridgeCosine,
  computeEdgeTransition,
  computeLexicalBridgeCosine,
  computeRrfQueryScores,
  computeStructuralRelation,
  computeTagWeightedJaccard,
  defaultTitleFromPath,
  normalizeTagName,
} from './contextForestScorer'
import {
  CONTEXT_FOREST_DEFAULTS,
  CONTEXT_FOREST_WORK_BUDGETS,
  type ContextForestDirectCandidate,
  type ContextForestEdgeBreakdown,
  type ContextForestEvidenceItem,
  type ContextForestMergedCandidate,
  type ContextForestNode,
  type ContextForestParams,
  type ContextForestRelationType,
  type ContextForestResult,
  type ContextForestTruncatedReason,
  normalizeContextForestParams,
} from './contextForestTypes'

export type ContextForestFrontmatterEdge = {
  targetPath: string
  field?: string
}

export type ContextForestGraphNodeInput = {
  path: string
  title?: string
  revision?: string
  outgoingWikilinks?: readonly string[]
  incomingWikilinks?: readonly string[]
  outgoingFrontmatter?: readonly (string | ContextForestFrontmatterEdge)[]
  incomingFrontmatter?: readonly (string | ContextForestFrontmatterEdge)[]
  tags?: readonly string[]
  degree?: number
  termFreqs?: Record<string, number>
  tfIdfVector?: ReadonlyMap<string, number>
  denseChunks?: readonly (readonly number[])[] | null
}

export type BuildContextForestInput = {
  params: ContextForestParams
  nodes: readonly ContextForestGraphNodeInput[]
  lexicalCandidates?: readonly RawSourceCandidate[]
  vectorCandidates?: readonly RawSourceCandidate[]
  lexicalActive?: boolean
  vectorActive?: boolean
  getLexicalCosine?: (pathU: string, pathV: string) => number
  getDenseCosine?: (pathU: string, pathV: string) => number | null
  getTermIdf?: (term: string) => number
  getTagDf?: (tag: string) => number
  getTagIdf?: (tag: string) => number
  rootAnchorScoreOverride?: number
  enableStructuralFloor?: boolean
  /** Lower §6 work caps for tests; never raises the defaults. */
  workBudgets?: Partial<
    Record<keyof typeof CONTEXT_FOREST_WORK_BUDGETS, number>
  >
  diagnosticsSeed?: Partial<ContextForestResult['diagnostics']>
}

type NormalizedGraphNode = {
  path: string
  title: string
  revision?: string
  outgoingWikilinks: Set<string>
  incomingWikilinks: Set<string>
  outgoingFrontmatter: Map<string, string | undefined>
  incomingFrontmatter: Map<string, string | undefined>
  tags: string[]
  degree: number
  tfIdfVector: ReadonlyMap<string, number>
  denseChunks: readonly (readonly number[])[] | null
}

type CandidateTransition = {
  parentPath: string
  targetPath: string
  targetDepth: number
  rootPath: string
  relation: ContextForestRelationType
  bidirectional: boolean
  frontmatterField?: string
  sharedTags?: string[]
  breakdown: ContextForestEdgeBreakdown
  targetQueryScore: number
}

/**
 * Plan §5.3 deterministic order: score desc -> depth asc -> root order ->
 * parent path -> child path.
 */
function compareTransitions(
  a: CandidateTransition,
  b: CandidateTransition,
  rootOrder: ReadonlyMap<string, number>,
): number {
  if (b.breakdown.effectiveScore !== a.breakdown.effectiveScore) {
    return b.breakdown.effectiveScore - a.breakdown.effectiveScore
  }
  if (a.targetDepth !== b.targetDepth) {
    return a.targetDepth - b.targetDepth
  }
  const rootA = rootOrder.get(a.rootPath) ?? Number.MAX_SAFE_INTEGER
  const rootB = rootOrder.get(b.rootPath) ?? Number.MAX_SAFE_INTEGER
  if (rootA !== rootB) {
    return rootA - rootB
  }
  if (a.parentPath !== b.parentPath) {
    return a.parentPath.localeCompare(b.parentPath)
  }
  return a.targetPath.localeCompare(b.targetPath)
}

class TransitionHeap {
  private readonly items: CandidateTransition[] = []

  constructor(
    private readonly before: (
      a: CandidateTransition,
      b: CandidateTransition,
    ) => number,
  ) {}

  get size(): number {
    return this.items.length
  }

  push(item: CandidateTransition): void {
    const items = this.items
    items.push(item)
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.before(items[i], items[parent]) >= 0) break
      ;[items[i], items[parent]] = [items[parent], items[i]]
      i = parent
    }
  }

  pop(): CandidateTransition | undefined {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length > 0 && last) {
      items[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let best = i
        if (left < items.length && this.before(items[left], items[best]) < 0) {
          best = left
        }
        if (
          right < items.length &&
          this.before(items[right], items[best]) < 0
        ) {
          best = right
        }
        if (best === i) break
        ;[items[i], items[best]] = [items[best], items[i]]
        i = best
      }
    }
    return top
  }
}

function normalizeGraphNodes(
  rawNodes: readonly ContextForestGraphNodeInput[],
  getTermIdf?: (term: string) => number,
): {
  nodeMap: Map<string, NormalizedGraphNode>
  tagDfMap: Map<string, number>
  termDfMap: Map<string, number>
} {
  const allowedPaths = new Set<string>()
  for (const raw of rawNodes) {
    if (raw.path) {
      allowedPaths.add(raw.path)
    }
  }

  const termDfMap = new Map<string, number>()
  const tagDfMap = new Map<string, number>()
  const nodeMap = new Map<string, NormalizedGraphNode>()

  for (const raw of rawNodes) {
    if (!raw.path) {
      continue
    }
    const normalizedTags = Array.from(
      new Set((raw.tags ?? []).map(normalizeTagName).filter(Boolean)),
    )
    for (const tag of normalizedTags) {
      tagDfMap.set(tag, (tagDfMap.get(tag) ?? 0) + 1)
    }
    if (raw.termFreqs) {
      for (const [term, tf] of Object.entries(raw.termFreqs)) {
        if (Number.isFinite(tf) && tf > 0) {
          termDfMap.set(term, (termDfMap.get(term) ?? 0) + 1)
        }
      }
    }
    nodeMap.set(raw.path, {
      path: raw.path,
      title: raw.title ?? defaultTitleFromPath(raw.path),
      revision: raw.revision,
      outgoingWikilinks: new Set<string>(),
      incomingWikilinks: new Set<string>(),
      outgoingFrontmatter: new Map<string, string | undefined>(),
      incomingFrontmatter: new Map<string, string | undefined>(),
      tags: normalizedTags,
      degree: typeof raw.degree === 'number' ? raw.degree : -1,
      tfIdfVector: raw.tfIdfVector ?? new Map<string, number>(),
      denseChunks: raw.denseChunks ?? null,
    })
  }

  const docCount = nodeMap.size
  const resolveTermIdf =
    getTermIdf ??
    ((term: string) => computeCorpusIdf(docCount, termDfMap.get(term) ?? 0))

  for (const raw of rawNodes) {
    const current = nodeMap.get(raw.path)
    if (!current) {
      continue
    }
    if (current.tfIdfVector.size === 0 && raw.termFreqs) {
      current.tfIdfVector = buildTopTfIdfVector(raw.termFreqs, resolveTermIdf)
    }
    for (const target of raw.outgoingWikilinks ?? []) {
      if (target !== raw.path && allowedPaths.has(target)) {
        current.outgoingWikilinks.add(target)
        nodeMap.get(target)?.incomingWikilinks.add(raw.path)
      }
    }
    for (const source of raw.incomingWikilinks ?? []) {
      if (source !== raw.path && allowedPaths.has(source)) {
        current.incomingWikilinks.add(source)
        nodeMap.get(source)?.outgoingWikilinks.add(raw.path)
      }
    }
    for (const fm of raw.outgoingFrontmatter ?? []) {
      const target = typeof fm === 'string' ? fm : fm.targetPath
      const field = typeof fm === 'string' ? undefined : fm.field
      if (target && target !== raw.path && allowedPaths.has(target)) {
        if (!current.outgoingFrontmatter.has(target)) {
          current.outgoingFrontmatter.set(target, field)
        }
        const targetNode = nodeMap.get(target)
        if (targetNode && !targetNode.incomingFrontmatter.has(raw.path)) {
          targetNode.incomingFrontmatter.set(raw.path, field)
        }
      }
    }
    for (const fm of raw.incomingFrontmatter ?? []) {
      const source = typeof fm === 'string' ? fm : fm.targetPath
      const field = typeof fm === 'string' ? undefined : fm.field
      if (source && source !== raw.path && allowedPaths.has(source)) {
        if (!current.incomingFrontmatter.has(source)) {
          current.incomingFrontmatter.set(source, field)
        }
        const sourceNode = nodeMap.get(source)
        if (sourceNode && !sourceNode.outgoingFrontmatter.has(raw.path)) {
          sourceNode.outgoingFrontmatter.set(raw.path, field)
        }
      }
    }
  }

  for (const node of nodeMap.values()) {
    // Strip frontmatter links that duplicate body wikilinks so frontmatter refs
    // are never double-counted with body wikilinks.
    for (const target of node.outgoingWikilinks) {
      node.outgoingFrontmatter.delete(target)
    }
    for (const source of node.incomingWikilinks) {
      node.incomingFrontmatter.delete(source)
    }
    if (node.degree < 0) {
      const structuralNeighbors = new Set<string>([
        ...node.outgoingWikilinks,
        ...node.incomingWikilinks,
        ...node.outgoingFrontmatter.keys(),
        ...node.incomingFrontmatter.keys(),
      ])
      node.degree = structuralNeighbors.size
    }
  }

  return { nodeMap, tagDfMap, termDfMap }
}

function areDirectlyConnected(
  nodeA: NormalizedGraphNode,
  nodeB: NormalizedGraphNode,
): boolean {
  return (
    nodeA.outgoingWikilinks.has(nodeB.path) ||
    nodeA.incomingWikilinks.has(nodeB.path) ||
    nodeA.outgoingFrontmatter.has(nodeB.path) ||
    nodeA.incomingFrontmatter.has(nodeB.path) ||
    nodeB.outgoingWikilinks.has(nodeA.path) ||
    nodeB.incomingWikilinks.has(nodeA.path) ||
    nodeB.outgoingFrontmatter.has(nodeA.path) ||
    nodeB.incomingFrontmatter.has(nodeA.path)
  )
}

function buildDirectEvidence(
  fused: FusedDirectCandidateScore,
  revision?: string,
): ContextForestEvidenceItem[] {
  const items: ContextForestEvidenceItem[] = []
  if (fused.lexicalRank !== null) {
    items.push({
      kind: 'query_lexical',
      targetPath: fused.path,
      detail: `rank=${fused.lexicalRank}, score=${(fused.lexicalScore ?? 0).toFixed(4)}`,
      locator: fused.lexicalCandidate?.locator,
      revision: fused.lexicalCandidate?.revision ?? revision,
    })
  }
  if (fused.vectorRank !== null) {
    items.push({
      kind: 'query_vector',
      targetPath: fused.path,
      detail: `rank=${fused.vectorRank}, score=${(fused.vectorScore ?? 0).toFixed(4)}`,
      locator: fused.vectorCandidate?.locator,
      revision: fused.vectorCandidate?.revision ?? revision,
    })
  }
  return items
}

function buildEdgeEvidence(
  transition: CandidateTransition,
  revision?: string,
): ContextForestEvidenceItem {
  if (transition.relation === 'frontmatter') {
    return {
      kind: 'frontmatter',
      sourcePath: transition.parentPath,
      targetPath: transition.targetPath,
      detail: transition.frontmatterField
        ? `field:${transition.frontmatterField}`
        : 'frontmatter reference',
      revision,
    }
  }
  if (transition.relation === 'tag') {
    return {
      kind: 'shared_tag',
      sourcePath: transition.parentPath,
      targetPath: transition.targetPath,
      detail: (transition.sharedTags ?? []).map((t) => `#${t}`).join(', '),
      revision,
    }
  }
  return {
    kind: transition.relation === 'backlink' ? 'backlink' : 'wikilink',
    sourcePath: transition.parentPath,
    targetPath: transition.targetPath,
    detail: transition.bidirectional ? 'bidirectional' : transition.relation,
    revision,
  }
}

export function buildContextForest(
  input: BuildContextForestInput,
): ContextForestResult {
  const params = normalizeContextForestParams(input.params)
  const { nodeMap, tagDfMap } = normalizeGraphNodes(
    input.nodes,
    input.getTermIdf,
  )
  const docCount = nodeMap.size

  const lexicalActive =
    input.lexicalActive ?? Boolean(input.lexicalCandidates !== undefined)
  const vectorActive =
    input.vectorActive ?? Boolean(input.vectorCandidates !== undefined)

  const allowedLexical = (input.lexicalCandidates ?? []).filter((c) =>
    nodeMap.has(c.path),
  )
  const allowedVector = (input.vectorCandidates ?? []).filter((c) =>
    nodeMap.has(c.path),
  )

  const rrfResult = computeRrfQueryScores({
    lexicalCandidates: allowedLexical,
    vectorCandidates: allowedVector,
    lexicalActive,
    vectorActive,
  })

  const queryObservedForRoots =
    rrfResult.queryScoreObserved && params.query.length > 0

  const getTagDf =
    input.getTagDf ??
    ((tag: string) => tagDfMap.get(normalizeTagName(tag)) ?? 0)
  const getTagIdf =
    input.getTagIdf ??
    ((tag: string) => computeCorpusIdf(docCount, getTagDf(tag)))

  const tagInvertedIndex = new Map<string, string[]>()
  if (params.includeTags) {
    for (const node of nodeMap.values()) {
      for (const tag of node.tags) {
        const bucket = tagInvertedIndex.get(tag)
        if (bucket) {
          bucket.push(node.path)
        } else {
          tagInvertedIndex.set(tag, [node.path])
        }
      }
    }
    for (const bucket of tagInvertedIndex.values()) {
      bucket.sort((a, b) => a.localeCompare(b))
    }
  }

  const getLexicalCosine = (pathU: string, pathV: string): number => {
    if (input.getLexicalCosine) {
      return input.getLexicalCosine(pathU, pathV)
    }
    const nodeU = nodeMap.get(pathU)
    const nodeV = nodeMap.get(pathV)
    if (!nodeU || !nodeV) {
      return 0
    }
    return computeLexicalBridgeCosine(nodeU.tfIdfVector, nodeV.tfIdfVector)
  }

  const getDenseCosine = (pathU: string, pathV: string): number | null => {
    if (input.getDenseCosine) {
      return input.getDenseCosine(pathU, pathV)
    }
    const nodeU = nodeMap.get(pathU)
    const nodeV = nodeMap.get(pathV)
    if (!nodeU || !nodeV) {
      return null
    }
    return computeDenseBridgeCosine(nodeU.denseChunks, nodeV.denseChunks)
  }

  const truncatedCounts: Partial<Record<ContextForestTruncatedReason, number>> =
    {}
  const recordTruncation = (
    reason: ContextForestTruncatedReason,
    count = 1,
  ) => {
    truncatedCounts[reason] = (truncatedCounts[reason] ?? 0) + count
  }

  // 1. Select roots (§4.2)
  const roots: ContextForestNode[] = []
  const rootPaths = new Set<string>()
  const nodesByPath = new Map<string, ContextForestNode>()

  if (params.rootPath) {
    const rootGraphNode = nodeMap.get(params.rootPath)
    if (rootGraphNode) {
      const fused = rrfResult.byPath.get(params.rootPath)
      const queryScore = fused?.queryScore ?? 0
      const anchorScore =
        typeof input.rootAnchorScoreOverride === 'number' &&
        Number.isFinite(input.rootAnchorScoreOverride)
          ? input.rootAnchorScoreOverride
          : 1.0
      const rootNode: ContextForestNode = {
        path: rootGraphNode.path,
        title: rootGraphNode.title,
        depth: 0,
        parentPath: null,
        rootPath: rootGraphNode.path,
        relationToParent: 'root',
        bidirectionalWithParent: false,
        degree: rootGraphNode.degree,
        queryScore,
        queryScoreObserved: queryObservedForRoots,
        anchorScore,
        pathScore: anchorScore,
        edgeBreakdown: null,
        isDirectCandidate: Boolean(fused),
        alsoReachedFrom: [],
        evidence: fused
          ? buildDirectEvidence(fused, rootGraphNode.revision)
          : [],
        snippet:
          fused?.vectorCandidate?.snippet ?? fused?.lexicalCandidate?.snippet,
        heading:
          fused?.vectorCandidate?.heading ??
          fused?.lexicalCandidate?.heading ??
          null,
        locator:
          fused?.vectorCandidate?.locator ?? fused?.lexicalCandidate?.locator,
        bodyIncluded: false,
        revision: rootGraphNode.revision,
        children: [],
      }
      roots.push(rootNode)
      rootPaths.add(rootNode.path)
      nodesByPath.set(rootNode.path, rootNode)
    }
  } else {
    const topCandidates = rrfResult.candidates
      .slice(0, CONTEXT_FOREST_DEFAULTS.rootCandidateRank)
      .filter((c) => c.queryScore > 0 && nodeMap.has(c.path))

    for (const candidate of topCandidates) {
      if (roots.length >= CONTEXT_FOREST_DEFAULTS.maxRoots) {
        break
      }
      if (nodesByPath.size >= params.maxNodes) {
        recordTruncation('max_nodes')
        break
      }
      const candidateGraph = nodeMap.get(candidate.path)
      if (!candidateGraph) {
        continue
      }
      const connectedToSelectedRoot = roots.some((selectedRoot) => {
        const selectedGraph = nodeMap.get(selectedRoot.path)
        if (!selectedGraph) {
          return false
        }
        return areDirectlyConnected(selectedGraph, candidateGraph)
      })
      if (connectedToSelectedRoot) {
        continue
      }
      const anchorScore =
        typeof input.rootAnchorScoreOverride === 'number' &&
        Number.isFinite(input.rootAnchorScoreOverride)
          ? input.rootAnchorScoreOverride
          : candidate.queryScore
      const rootNode: ContextForestNode = {
        path: candidateGraph.path,
        title: candidateGraph.title,
        depth: 0,
        parentPath: null,
        rootPath: candidateGraph.path,
        relationToParent: 'root',
        bidirectionalWithParent: false,
        degree: candidateGraph.degree,
        queryScore: candidate.queryScore,
        queryScoreObserved: queryObservedForRoots,
        anchorScore,
        pathScore: anchorScore,
        edgeBreakdown: null,
        isDirectCandidate: true,
        alsoReachedFrom: [],
        evidence: buildDirectEvidence(candidate, candidateGraph.revision),
        snippet:
          candidate.vectorCandidate?.snippet ??
          candidate.lexicalCandidate?.snippet,
        heading:
          candidate.vectorCandidate?.heading ??
          candidate.lexicalCandidate?.heading ??
          null,
        locator:
          candidate.vectorCandidate?.locator ??
          candidate.lexicalCandidate?.locator,
        bodyIncluded: false,
        revision: candidateGraph.revision,
        children: [],
      }
      roots.push(rootNode)
      rootPaths.add(rootNode.path)
      nodesByPath.set(rootNode.path, rootNode)
    }
  }

  // 2. Fixed-parent best-first expansion (§5.3). Adopted nodes never move,
  // so cycles cannot form and no subtree is ever recomputed.
  const budgets: Record<keyof typeof CONTEXT_FOREST_WORK_BUDGETS, number> = {
    ...CONTEXT_FOREST_WORK_BUDGETS,
  }
  for (const [key, value] of Object.entries(input.workBudgets ?? {})) {
    const name = key as keyof typeof budgets
    if (typeof value === 'number' && value >= 0 && value < budgets[name]) {
      budgets[name] = value
    }
  }
  const rootOrder = new Map<string, number>()
  roots.forEach((root, index) => rootOrder.set(root.path, index))
  let edgeEvaluations = 0
  let queueInsertions = 0
  let workExhausted = false

  const isSelfOrAncestor = (path: string, node: ContextForestNode): boolean => {
    let cursor: ContextForestNode | undefined = node
    while (cursor) {
      if (cursor.path === path) return true
      cursor = cursor.parentPath
        ? nodesByPath.get(cursor.parentPath)
        : undefined
    }
    return false
  }

  const explicitNeighbors = (graphU: NormalizedGraphNode): string[] =>
    Array.from(
      new Set<string>([
        ...graphU.outgoingWikilinks,
        ...graphU.incomingWikilinks,
        ...graphU.outgoingFrontmatter.keys(),
        ...graphU.incomingFrontmatter.keys(),
      ]),
    ).sort((a, b) => a.localeCompare(b))

  // §6/§13.1: explicit references first, then tag buckets, each enumerated in
  // path order under a fixed scan cap instead of sorting whole hub buckets.
  const enumerateNeighbors = (graphU: NormalizedGraphNode): string[] => {
    const explicit = explicitNeighbors(graphU)
    let truncated = explicit.length > budgets.maxNeighborsPerParent
    const neighbors = explicit.slice(0, budgets.maxNeighborsPerParent)
    if (params.includeTags && !truncated) {
      const seen = new Set<string>([graphU.path, ...explicit])
      let scanned = 0
      const tags = [...graphU.tags].sort((a, b) => a.localeCompare(b))
      outer: for (const tag of tags) {
        for (const path of tagInvertedIndex.get(tag) ?? []) {
          if (scanned >= budgets.maxTagBucketScanPerParent) {
            truncated = true
            break outer
          }
          scanned += 1
          if (seen.has(path)) continue
          if (neighbors.length >= budgets.maxNeighborsPerParent) {
            truncated = true
            break outer
          }
          seen.add(path)
          neighbors.push(path)
        }
      }
    }
    if (truncated) {
      recordTruncation('neighbor_cap')
    }
    return neighbors
  }

  const evaluateTransition = (
    parentNode: ContextForestNode,
    graphU: NormalizedGraphNode,
    targetPath: string,
  ): CandidateTransition | null => {
    const graphV = nodeMap.get(targetPath)
    if (!graphV) {
      return null
    }
    edgeEvaluations += 1
    const outgoingWikilink = graphU.outgoingWikilinks.has(targetPath)
    const incomingWikilink = graphU.incomingWikilinks.has(targetPath)
    const outgoingFrontmatter = graphU.outgoingFrontmatter.has(targetPath)
    const incomingFrontmatter = graphU.incomingFrontmatter.has(targetPath)
    const hasLinkOrFm =
      outgoingWikilink ||
      incomingWikilink ||
      outgoingFrontmatter ||
      incomingFrontmatter

    let tagWeightedJaccard = 0
    let sharedTags: string[] = []
    if (!hasLinkOrFm && params.includeTags) {
      const tagMatch = computeTagWeightedJaccard(
        graphU.tags,
        graphV.tags,
        getTagIdf,
      )
      tagWeightedJaccard = tagMatch.weightedJaccard
      sharedTags = tagMatch.sharedTags
    }

    const structural = computeStructuralRelation({
      outgoingWikilink,
      incomingWikilink,
      outgoingFrontmatter,
      incomingFrontmatter,
      includeTags: params.includeTags,
      tagWeightedJaccard,
      sharedTags,
    })
    if (!structural) {
      return null
    }

    const fusedV = rrfResult.byPath.get(targetPath)
    const targetQueryScore = fusedV?.queryScore ?? 0
    const { breakdown, verdict } = computeEdgeTransition({
      parentScore: parentNode.pathScore,
      rootScore: nodesByPath.get(parentNode.rootPath)?.pathScore ?? 0,
      relation: structural.relation,
      structuralScore: structural.structuralScore,
      lexicalCosine: getLexicalCosine(parentNode.path, targetPath),
      denseCosine: getDenseCosine(parentNode.path, targetPath),
      targetQueryScore,
      enableStructuralFloor: input.enableStructuralFloor,
    })
    if (verdict !== 'accepted') {
      recordTruncation(verdict)
      return null
    }

    return {
      parentPath: parentNode.path,
      targetPath,
      targetDepth: parentNode.depth + 1,
      rootPath: parentNode.rootPath,
      relation: structural.relation,
      bidirectional: structural.bidirectional,
      frontmatterField:
        graphU.outgoingFrontmatter.get(targetPath) ??
        graphU.incomingFrontmatter.get(targetPath),
      sharedTags: sharedTags.length > 0 ? sharedTags : undefined,
      breakdown,
      targetQueryScore,
    }
  }

  const frontier = new TransitionHeap((a, b) =>
    compareTransitions(a, b, rootOrder),
  )
  const enqueueParentTransitions = (parentNode: ContextForestNode) => {
    if (workExhausted) {
      return
    }
    const graphU = nodeMap.get(parentNode.path)
    if (!graphU) {
      return
    }
    if (parentNode.depth >= params.maxDepth) {
      if (explicitNeighbors(graphU).some((path) => !nodesByPath.has(path))) {
        recordTruncation('max_depth')
      }
      return
    }
    for (const targetPath of enumerateNeighbors(graphU)) {
      const existing = nodesByPath.get(targetPath)
      if (existing && isSelfOrAncestor(targetPath, parentNode)) {
        recordTruncation('cycle_prevented')
        continue
      }
      if (edgeEvaluations >= budgets.maxEdgeEvaluations) {
        recordTruncation('edge_budget')
        workExhausted = true
        return
      }
      const transition = evaluateTransition(parentNode, graphU, targetPath)
      if (!transition) {
        continue
      }
      if (existing) {
        recordAlternateReach(existing, transition)
        recordTruncation('dominated_duplicate')
        continue
      }
      if (queueInsertions >= budgets.maxQueueInsertions) {
        recordTruncation('queue_budget')
        workExhausted = true
        return
      }
      queueInsertions += 1
      frontier.push(transition)
    }
  }

  for (const root of roots) {
    enqueueParentTransitions(root)
  }

  while (frontier.size > 0) {
    const candidate = frontier.pop()
    if (!candidate) {
      break
    }
    const parentNode = nodesByPath.get(candidate.parentPath)
    if (!parentNode) {
      continue
    }
    const existingNode = nodesByPath.get(candidate.targetPath)
    if (existingNode) {
      recordAlternateReach(existingNode, candidate)
      recordTruncation('dominated_duplicate')
      continue
    }
    if (parentNode.children.length >= params.maxBranchPerNode) {
      recordTruncation('max_branch_per_node')
      continue
    }

    if (nodesByPath.size >= params.maxNodes) {
      recordTruncation('max_nodes', frontier.size + 1)
      break
    }

    const graphV = nodeMap.get(candidate.targetPath)
    if (!graphV) {
      continue
    }
    const fusedV = rrfResult.byPath.get(candidate.targetPath)
    const directEvidence = fusedV
      ? buildDirectEvidence(fusedV, graphV.revision)
      : []
    const edgeEvidence = buildEdgeEvidence(candidate, graphV.revision)

    const newNode: ContextForestNode = {
      path: graphV.path,
      title: graphV.title,
      depth: candidate.targetDepth,
      parentPath: parentNode.path,
      rootPath: parentNode.rootPath,
      relationToParent: candidate.relation,
      bidirectionalWithParent: candidate.bidirectional,
      frontmatterField: candidate.frontmatterField,
      sharedTags: candidate.sharedTags,
      degree: graphV.degree,
      queryScore: candidate.targetQueryScore,
      queryScoreObserved: queryObservedForRoots,
      anchorScore: parentNode.anchorScore,
      pathScore: candidate.breakdown.effectiveScore,
      edgeBreakdown: candidate.breakdown,
      isDirectCandidate: Boolean(fusedV),
      alsoReachedFrom: [],
      evidence: [edgeEvidence, ...directEvidence],
      snippet:
        fusedV?.vectorCandidate?.snippet ?? fusedV?.lexicalCandidate?.snippet,
      heading:
        fusedV?.vectorCandidate?.heading ??
        fusedV?.lexicalCandidate?.heading ??
        null,
      locator:
        fusedV?.vectorCandidate?.locator ?? fusedV?.lexicalCandidate?.locator,
      bodyIncluded: false,
      revision: graphV.revision,
      children: [],
    }

    parentNode.children.push(newNode)
    sortNodeChildren(parentNode)
    nodesByPath.set(newNode.path, newNode)
    enqueueParentTransitions(newNode)
  }

  // 3. Collect ordered forest nodes via deterministic pre-order traversal
  const orderedForestNodes: ContextForestNode[] = []
  const traversePreOrder = (node: ContextForestNode) => {
    sortNodeChildren(node)
    orderedForestNodes.push(node)
    for (const child of node.children) {
      traversePreOrder(child)
    }
  }
  for (const root of roots) {
    traversePreOrder(root)
  }

  const nodesByPathRecord: Record<string, ContextForestNode> = {}
  for (const node of orderedForestNodes) {
    nodesByPathRecord[node.path] = node
  }

  // 4. Build directCandidates (outside max_nodes) and mergedCandidates (§13.3 item 8)
  const directCandidates: ContextForestDirectCandidate[] =
    rrfResult.candidates.map((fused) => {
      const graphNode = nodeMap.get(fused.path)
      const forestNode = nodesByPath.get(fused.path)
      return {
        path: fused.path,
        title: graphNode?.title ?? fused.title,
        lexicalRank: fused.lexicalRank,
        lexicalScore: fused.lexicalScore,
        vectorRank: fused.vectorRank,
        vectorScore: fused.vectorScore,
        rrfScore: fused.rrfScore,
        queryScore: fused.queryScore,
        queryScoreObserved: rrfResult.queryScoreObserved,
        inForest: Boolean(forestNode),
        snippet:
          forestNode?.snippet ??
          fused.vectorCandidate?.snippet ??
          fused.lexicalCandidate?.snippet,
        heading:
          forestNode?.heading ??
          fused.vectorCandidate?.heading ??
          fused.lexicalCandidate?.heading ??
          null,
        locator:
          forestNode?.locator ??
          fused.vectorCandidate?.locator ??
          fused.lexicalCandidate?.locator,
        bodyIncluded: Boolean(forestNode?.bodyIncluded),
        revision: graphNode?.revision,
        evidence: buildDirectEvidence(fused, graphNode?.revision),
      }
    })

  const mergedByPath = new Map<string, ContextForestMergedCandidate>()
  for (const direct of directCandidates) {
    const forest = nodesByPath.get(direct.path)
    mergedByPath.set(direct.path, {
      path: direct.path,
      title: direct.title,
      membership: forest ? ['direct', 'forest'] : ['direct'],
      direct,
      forest,
    })
  }
  for (const forest of orderedForestNodes) {
    if (!mergedByPath.has(forest.path)) {
      mergedByPath.set(forest.path, {
        path: forest.path,
        title: forest.title,
        membership: ['forest'],
        forest,
      })
    }
  }

  return {
    query: params.query,
    params,
    roots,
    nodes: orderedForestNodes,
    nodesByPath: nodesByPathRecord,
    directCandidates,
    mergedCandidates: [...mergedByPath.values()],
    diagnostics: {
      lexicalReady: input.diagnosticsSeed?.lexicalReady ?? lexicalActive,
      vectorReady: input.diagnosticsSeed?.vectorReady ?? vectorActive,
      activeSourceCount: rrfResult.activeSourceCount,
      lexicalGeneration: input.diagnosticsSeed?.lexicalGeneration ?? null,
      scopeFingerprint: input.diagnosticsSeed?.scopeFingerprint ?? 'default',
      allowedDocCount: input.diagnosticsSeed?.allowedDocCount ?? docCount,
      excludedDocCount: input.diagnosticsSeed?.excludedDocCount ?? 0,
      hydratedNoteCount: input.diagnosticsSeed?.hydratedNoteCount ?? 0,
      hydratedBytes: input.diagnosticsSeed?.hydratedBytes ?? 0,
      dbQueriesExecuted: input.diagnosticsSeed?.dbQueriesExecuted ?? 0,
      representativeRowsLoaded:
        input.diagnosticsSeed?.representativeRowsLoaded ?? 0,
      scanCapExceededPaths: input.diagnosticsSeed?.scanCapExceededPaths ?? [],
      stalePathsDropped: input.diagnosticsSeed?.stalePathsDropped ?? [],
      truncatedCounts,
      elapsedMs: input.diagnosticsSeed?.elapsedMs ?? 0,
      timedOut: input.diagnosticsSeed?.timedOut ?? false,
    },
  }
}

function recordAlternateReach(
  node: ContextForestNode,
  transition: CandidateTransition,
): void {
  if (
    node.alsoReachedFrom.length >=
    CONTEXT_FOREST_WORK_BUDGETS.maxAlternateReaches
  ) {
    return
  }
  const alreadyRecorded = node.alsoReachedFrom.some(
    (entry) =>
      entry.parentPath === transition.parentPath &&
      entry.relation === transition.relation,
  )
  if (!alreadyRecorded && transition.parentPath !== node.parentPath) {
    node.alsoReachedFrom.push({
      parentPath: transition.parentPath,
      relation: transition.relation,
      effectiveScore: transition.breakdown.effectiveScore,
    })
    node.alsoReachedFrom.sort((a, b) => {
      if (b.effectiveScore !== a.effectiveScore) {
        return b.effectiveScore - a.effectiveScore
      }
      return a.parentPath.localeCompare(b.parentPath)
    })
  }
}

function sortNodeChildren(node: ContextForestNode): void {
  node.children.sort((a, b) => {
    if (b.pathScore !== a.pathScore) {
      return b.pathScore - a.pathScore
    }
    if (b.queryScore !== a.queryScore) {
      return b.queryScore - a.queryScore
    }
    const structA = a.edgeBreakdown?.structuralScore ?? 0
    const structB = b.edgeBreakdown?.structuralScore ?? 0
    if (structB !== structA) {
      return structB - structA
    }
    const lexA = a.edgeBreakdown?.lexicalCosine ?? 0
    const lexB = b.edgeBreakdown?.lexicalCosine ?? 0
    if (lexB !== lexA) {
      return lexB - lexA
    }
    return a.path.localeCompare(b.path)
  })
}
