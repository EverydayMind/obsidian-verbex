import { App, getAllTags } from 'obsidian'

import { computeTermFreq } from '../core/rag/bm25'
import {
  type ContextForestGraphNodeInput,
  buildContextForest,
} from '../core/rag/contextForestBuilder'
import { computeCorpusIdf } from '../core/rag/contextForestScorer'
import {
  type ContextForestNode,
  type ContextForestParams,
  type ContextForestResult,
  type ContextForestTruncatedReason,
  normalizeContextForestParams,
} from '../core/rag/contextForestTypes'
import type { ChunkLocator } from '../core/rag/retrievalTypes'
import { VerbexSettings } from '../settings/schema/setting.types'

import type { SemanticSearchProvider } from './ContextBuilder'
import {
  type FormattedContextForestOutput,
  formatContextForestResult,
} from './contextForestFormatter'
import {
  FOREST_IO_BUDGETS,
  type ScopedLexicalGraphCacheEntry,
  SingleFlightSqlGate,
  buildScopedLexicalGraphCacheEntry,
  computeResolvedLinksSignature,
  computeScopeFingerprint,
  createPathScopePredicate,
  fetchRepresentativeChunkEmbeddings,
  fetchScopedVectorDirectCandidates,
  searchScopedLexicalCandidates,
} from './contextForestSources'
import {
  type LexicalDocument,
  type LexicalIndexRepository,
  type LexicalIndexSnapshot,
  buildSnippet,
  findBestHeading,
  findMentionContext,
} from './LexicalIndex'

export const FOREST_HYDRATION_BUDGETS = {
  maxHydratedNotes: 10,
  maxHydratedBytes: 1024 * 1024,
  defaultDeadlineMs: 1800,
  maxScopedCacheEntries: 4,
} as const

export type ContextForestServiceDeps = {
  app: App
  getSettings: () => VerbexSettings
  lexicalIndex?: LexicalIndexRepository | null
  getSemanticProvider?: () => Promise<SemanticSearchProvider | null>
  peekSemanticProvider?: () => SemanticSearchProvider | null
  defaultDeadlineMs?: number
  allowDiskSnapshotLoad?: boolean
}

export type ContextForestSearchOptions = {
  signal?: AbortSignal
  deadlineMs?: number
  enableStructuralFloor?: boolean
}

export class ContextForestService {
  private readonly sqlGate = new SingleFlightSqlGate()
  private readonly scopedCache = new Map<string, ScopedLexicalGraphCacheEntry>()
  private cachedLexicalGeneration: number | null = null

  constructor(private readonly deps: ContextForestServiceDeps) {}

  hasUnsettledSqlQuery(): boolean {
    return this.sqlGate.hasUnsettledQuery()
  }

  async search(
    rawParams: ContextForestParams,
    options: ContextForestSearchOptions = {},
  ): Promise<{
    result: ContextForestResult
    formatted: FormattedContextForestOutput
  }> {
    const startedAt = Date.now()
    const deadlineMs =
      options.deadlineMs ??
      this.deps.defaultDeadlineMs ??
      FOREST_HYDRATION_BUDGETS.defaultDeadlineMs
    const deadlineAt = startedAt + Math.max(50, deadlineMs)
    const settings = this.deps.getSettings()
    const params = normalizeContextForestParams(rawParams)

    const extraTruncated: Partial<
      Record<ContextForestTruncatedReason, number>
    > = {}
    const addTruncated = (reason: ContextForestTruncatedReason, count = 1) => {
      extraTruncated[reason] = (extraTruncated[reason] ?? 0) + count
    }
    const stalePathsSet = new Set<string>()
    let dbQueriesExecuted = 0
    let timedOut = false

    const onBudgetExhausted = () => {
      timedOut = true
      addTruncated('budget_exhausted')
    }

    // 1. Read ready lexical snapshot without ever triggering a cold vault refresh
    const allowDiskLoad = this.deps.allowDiskSnapshotLoad ?? true
    const readyLexical = this.deps.lexicalIndex
      ? await this.deps.lexicalIndex.getReadySnapshot(allowDiskLoad)
      : null
    const lexicalReady = readyLexical !== null
    const lexicalGeneration = readyLexical?.generation ?? null

    let cacheEntry: ScopedLexicalGraphCacheEntry
    if (readyLexical) {
      cacheEntry = this.getOrBuildScopedCacheEntry(
        settings,
        params,
        readyLexical.generation,
        readyLexical.snapshot,
      )
    } else {
      cacheEntry = this.buildMetadataFallbackEntry(settings, params)
    }

    const isAllowedPath = createPathScopePredicate(
      this.deps.app,
      settings,
      params,
    )

    // 2. Direct candidates from scoped Lexical BM25 and bounded Vector search
    const lexicalActive = lexicalReady && params.query.length > 0
    const lexicalCandidates = lexicalActive
      ? searchScopedLexicalCandidates(cacheEntry, params.query, /* limit */ 30)
      : []

    const searchMode = settings.verbex.search.mode
    const wantVector =
      params.query.length > 0 &&
      (searchMode === 'hybrid' || searchMode === 'embedding')
    let semanticProvider: SemanticSearchProvider | null = null
    if (wantVector) {
      if (this.deps.peekSemanticProvider) {
        try {
          semanticProvider = this.deps.peekSemanticProvider()
        } catch {
          semanticProvider = null
        }
      } else if (this.deps.getSemanticProvider) {
        try {
          semanticProvider = await this.deps.getSemanticProvider()
        } catch {
          semanticProvider = null
        }
      }
    }

    const vectorDirectResult = wantVector
      ? await fetchScopedVectorDirectCandidates({
          app: this.deps.app,
          query: params.query,
          provider: semanticProvider,
          isAllowedPath,
          expectedMtimeByPath: cacheEntry.expectedMtimeByPath,
          expectedRevisionByPath: cacheEntry.expectedRevisionByPath,
          sqlGate: this.sqlGate,
          deadlineAt,
          signal: options.signal,
          maxCandidates: 30,
          onDbQueryExecuted: () => {
            dbQueriesExecuted += 1
          },
          onBudgetExhausted,
          onStalePathDropped: (path) => {
            stalePathsSet.add(path)
            addTruncated('revision_mismatch')
          },
        })
      : { vectorActive: false, candidates: [] }

    // 3. Collect up to 50 candidate paths for bounded dense bridge D(u, v)
    const denseBridgeCandidatePaths = this.selectDenseBridgeCandidatePaths(
      params.rootPath,
      lexicalCandidates.map((c) => c.path),
      vectorDirectResult.candidates.map((c) => c.path),
      cacheEntry.graphNodesByPath,
    )

    const denseRepResult =
      semanticProvider && denseBridgeCandidatePaths.length > 0
        ? await fetchRepresentativeChunkEmbeddings({
            app: this.deps.app,
            candidatePaths: denseBridgeCandidatePaths,
            provider: semanticProvider,
            expectedMtimeByPath: cacheEntry.expectedMtimeByPath,
            sqlGate: this.sqlGate,
            deadlineAt,
            signal: options.signal,
            onDbQueryExecuted: () => {
              dbQueriesExecuted += 1
            },
            onBudgetExhausted,
            onStalePathDropped: (path) => {
              stalePathsSet.add(path)
              addTruncated('revision_mismatch')
            },
          })
        : {
            chunksByPath: new Map<string, number[][]>(),
            representativeRowsLoaded: 0,
            scanCapExceededPaths: [],
          }

    // 4. Assemble graph node inputs with representative dense chunks attached
    const graphNodes: ContextForestGraphNodeInput[] = []
    for (const [path, baseNode] of cacheEntry.graphNodesByPath.entries()) {
      const denseChunks = denseRepResult.chunksByPath.get(path) ?? null
      graphNodes.push(denseChunks ? { ...baseNode, denseChunks } : baseNode)
    }

    const docCount = cacheEntry.allowedDocCount
    const getTermIdf = (term: string) =>
      computeCorpusIdf(docCount, cacheEntry.termDfMap.get(term) ?? 0)
    const getTagDf = (tag: string) => cacheEntry.tagDfMap.get(tag) ?? 0
    const getTagIdf = (tag: string) => computeCorpusIdf(docCount, getTagDf(tag))

    const result = buildContextForest({
      params,
      nodes: graphNodes,
      lexicalCandidates,
      vectorCandidates: vectorDirectResult.candidates,
      lexicalActive,
      vectorActive: vectorDirectResult.vectorActive,
      getTermIdf,
      getTagDf,
      getTagIdf,
      enableStructuralFloor: options.enableStructuralFloor,
      diagnosticsSeed: {
        lexicalReady,
        vectorReady: vectorDirectResult.vectorActive,
        lexicalGeneration,
        scopeFingerprint: cacheEntry.scopeFingerprint,
        allowedDocCount: cacheEntry.allowedDocCount,
        excludedDocCount: cacheEntry.excludedDocCount,
        dbQueriesExecuted,
        representativeRowsLoaded: denseRepResult.representativeRowsLoaded,
        scanCapExceededPaths: denseRepResult.scanCapExceededPaths,
        timedOut,
      },
    })

    // 5. Verify live mtime / link consistency before Phase 2 and prune stale subtrees
    this.pruneStaleNodesAndSubtrees(
      result,
      cacheEntry,
      stalePathsSet,
      addTruncated,
    )

    // 6. Phase 2: Bounded body snippet hydration (max 10 notes, max 1 MiB)
    const hydrationStats = await this.hydrateResultSnippets({
      result,
      cacheEntry,
      deadlineAt,
      signal: options.signal,
      stalePathsSet,
      addTruncated,
      onBudgetExhausted,
    })

    // Merge extraTruncated counts into result.diagnostics.truncatedCounts
    for (const [reason, count] of Object.entries(extraTruncated) as [
      ContextForestTruncatedReason,
      number,
    ][]) {
      if (count > 0) {
        result.diagnostics.truncatedCounts[reason] =
          (result.diagnostics.truncatedCounts[reason] ?? 0) + count
      }
    }
    result.diagnostics.hydratedNoteCount = hydrationStats.hydratedNoteCount
    result.diagnostics.hydratedBytes = hydrationStats.hydratedBytes
    result.diagnostics.stalePathsDropped = [...stalePathsSet]
    result.diagnostics.timedOut = timedOut

    const formatted = formatContextForestResult(result)
    result.diagnostics.elapsedMs = Math.max(0, Date.now() - startedAt)

    return { result, formatted }
  }

  private getOrBuildScopedCacheEntry(
    settings: VerbexSettings,
    params: ReturnType<typeof normalizeContextForestParams>,
    lexicalGeneration: number,
    snapshot: LexicalIndexSnapshot,
  ): ScopedLexicalGraphCacheEntry {
    if (this.cachedLexicalGeneration !== lexicalGeneration) {
      this.scopedCache.clear()
      this.cachedLexicalGeneration = lexicalGeneration
    }
    const scopeFingerprint = computeScopeFingerprint(settings, params)
    const cacheKey = `${lexicalGeneration}:${scopeFingerprint}`
    const existing = this.scopedCache.get(cacheKey)
    if (existing) {
      const currentLinksSig = computeResolvedLinksSignature(
        this.deps.app,
        existing.allowedDocsByPath.keys(),
      )
      if (currentLinksSig === existing.linksSignature) {
        return existing
      }
    }

    const built = buildScopedLexicalGraphCacheEntry({
      app: this.deps.app,
      settings,
      params,
      lexicalGeneration,
      snapshot,
    })
    if (
      this.scopedCache.size >= FOREST_HYDRATION_BUDGETS.maxScopedCacheEntries
    ) {
      const firstKey = this.scopedCache.keys().next()
      if (!firstKey.done) {
        this.scopedCache.delete(firstKey.value)
      }
    }
    this.scopedCache.set(cacheKey, built)
    return built
  }

  /**
   * Builds a lightweight metadata-only snapshot from `vault.getMarkdownFiles()`
   * and `metadataCache` without reading any file bodies when `LexicalIndex` has
   * not warmed up yet.
   */
  private buildMetadataFallbackEntry(
    settings: VerbexSettings,
    params: ReturnType<typeof normalizeContextForestParams>,
  ): ScopedLexicalGraphCacheEntry {
    const files = this.deps.app.vault.getMarkdownFiles?.() ?? []
    const documents: LexicalDocument[] = files.map((file) => {
      const cache = this.deps.app.metadataCache?.getFileCache?.(file) ?? null
      const headings = (cache?.headings ?? []).map((h) => h.heading)
      const tags = [
        ...new Set(
          (cache ? (getAllTags(cache) ?? []) : []).map((t) =>
            t.replace(/^#/, ''),
          ),
        ),
      ]
      const links = (cache?.links ?? []).map((l) => l.link)
      const syntheticText = [file.basename, headings.join(' '), tags.join(' ')]
        .filter(Boolean)
        .join(' ')
      const { termFreq, length } = computeTermFreq(syntheticText)
      return {
        path: file.path,
        mtime: file.stat.mtime,
        title: file.basename,
        headings,
        links,
        tags,
        aliases: [],
        termFreq,
        length,
      }
    })
    return buildScopedLexicalGraphCacheEntry({
      app: this.deps.app,
      settings,
      params,
      lexicalGeneration: -1,
      snapshot: {
        schemaVersion: 3,
        updatedAt: new Date(0).toISOString(),
        documentCount: documents.length,
        documents,
      },
    })
  }

  private selectDenseBridgeCandidatePaths(
    rootPath: string | undefined,
    lexicalPaths: readonly string[],
    vectorPaths: readonly string[],
    graphNodesByPath: ReadonlyMap<string, ContextForestGraphNodeInput>,
  ): string[] {
    const selected: string[] = []
    const seen = new Set<string>()
    const pushPath = (path: string | undefined) => {
      if (
        !path ||
        seen.has(path) ||
        !graphNodesByPath.has(path) ||
        selected.length >= FOREST_IO_BUDGETS.maxDenseBridgePaths
      ) {
        return
      }
      seen.add(path)
      selected.push(path)
    }

    pushPath(rootPath)
    for (const p of lexicalPaths.slice(0, 10)) {
      pushPath(p)
    }
    for (const p of vectorPaths.slice(0, 10)) {
      pushPath(p)
    }

    // Expand 1-hop and 2-hop structural neighbors around initial seeds
    const seeds = [...selected]
    for (const seedPath of seeds) {
      if (selected.length >= FOREST_IO_BUDGETS.maxDenseBridgePaths) break
      const node = graphNodesByPath.get(seedPath)
      if (!node) continue
      for (const target of node.outgoingWikilinks ?? []) {
        pushPath(target)
      }
      for (const fm of node.outgoingFrontmatter ?? []) {
        pushPath(typeof fm === 'string' ? fm : fm.targetPath)
      }
    }
    return selected
  }

  private pruneStaleNodesAndSubtrees(
    result: ContextForestResult,
    cacheEntry: ScopedLexicalGraphCacheEntry,
    stalePathsSet: Set<string>,
    addTruncated: (
      reason: ContextForestTruncatedReason,
      count?: number,
    ) => void,
  ): void {
    const isNodeStale = (path: string, expectedRevision?: string): boolean => {
      const liveFile = this.deps.app.vault.getFileByPath?.(path)
      const expectedMtime = cacheEntry.expectedMtimeByPath.get(path)
      if (liveFile && expectedMtime !== undefined) {
        if (liveFile.stat.mtime !== expectedMtime) {
          return true
        }
        const liveRevision = `${liveFile.stat.mtime}:${liveFile.stat.size}`
        if (expectedRevision && expectedRevision !== liveRevision) {
          return true
        }
      }
      return false
    }

    const removedForestPaths = new Set<string>()
    const markSubtreeRemoved = (node: ContextForestNode) => {
      removedForestPaths.add(node.path)
      stalePathsSet.add(node.path)
      addTruncated('revision_mismatch')
      for (const child of node.children) {
        markSubtreeRemoved(child)
      }
    }

    const filterTree = (nodes: ContextForestNode[]): ContextForestNode[] => {
      const kept: ContextForestNode[] = []
      for (const node of nodes) {
        if (isNodeStale(node.path, node.revision)) {
          markSubtreeRemoved(node)
          continue
        }
        node.children = filterTree(node.children)
        kept.push(node)
      }
      return kept
    }

    result.roots = filterTree(result.roots)
    if (removedForestPaths.size > 0) {
      result.nodes = result.nodes.filter(
        (node) => !removedForestPaths.has(node.path),
      )
      const nextByPath: Record<string, ContextForestNode> = {}
      for (const node of result.nodes) {
        nextByPath[node.path] = node
      }
      result.nodesByPath = nextByPath
    }

    // Also drop stale direct candidates
    result.directCandidates = result.directCandidates.filter((direct) => {
      if (
        removedForestPaths.has(direct.path) ||
        isNodeStale(direct.path, direct.revision)
      ) {
        stalePathsSet.add(direct.path)
        addTruncated('revision_mismatch')
        return false
      }
      direct.inForest = Boolean(result.nodesByPath[direct.path])
      return true
    })
  }

  private async hydrateResultSnippets(input: {
    result: ContextForestResult
    cacheEntry: ScopedLexicalGraphCacheEntry
    deadlineAt: number
    signal?: AbortSignal
    stalePathsSet: Set<string>
    addTruncated: (reason: ContextForestTruncatedReason, count?: number) => void
    onBudgetExhausted: () => void
  }): Promise<{
    hydratedNoteCount: number
    hydratedBytes: number
  }> {
    const {
      result,
      cacheEntry,
      deadlineAt,
      signal,
      stalePathsSet,
      addTruncated,
      onBudgetExhausted,
    } = input

    if (result.params.mapOnly) {
      for (const node of result.nodes) {
        node.snippet = undefined
        node.bodyIncluded = false
      }
      for (const direct of result.directCandidates) {
        direct.snippet = undefined
        direct.bodyIncluded = false
      }
      return { hydratedNoteCount: 0, hydratedBytes: 0 }
    }

    // Clear any unverified snippets on graph-only nodes when includeLeafSnippets is false
    if (!result.params.includeLeafSnippets) {
      for (const node of result.nodes) {
        if (!node.isDirectCandidate && node.depth > 0) {
          node.snippet = undefined
          node.bodyIncluded = false
        }
      }
    }

    // Build ordered list of paths to hydrate:
    // 1. Direct candidates (queryScore DESC)
    // 2. Explicit root (if depth === 0 and not already a direct candidate)
    // 3. Graph-only forest nodes when includeLeafSnippets === true (pathScore DESC)
    const hydrationQueue: string[] = []
    const queuedSet = new Set<string>()
    const enqueue = (path: string) => {
      if (!queuedSet.has(path)) {
        queuedSet.add(path)
        hydrationQueue.push(path)
      }
    }

    for (const direct of result.directCandidates) {
      enqueue(direct.path)
    }
    for (const root of result.roots) {
      enqueue(root.path)
    }
    if (result.params.includeLeafSnippets) {
      const graphOnlyNodes = result.nodes
        .filter((n) => !n.isDirectCandidate)
        .sort((a, b) =>
          b.pathScore !== a.pathScore
            ? b.pathScore - a.pathScore
            : a.path.localeCompare(b.path),
        )
      for (const node of graphOnlyNodes) {
        enqueue(node.path)
      }
    }

    let hydratedNoteCount = 0
    let hydratedBytes = 0

    for (const path of hydrationQueue) {
      const direct = result.directCandidates.find((d) => d.path === path)
      const forestNode = result.nodesByPath[path]
      if (!direct && !forestNode) {
        continue
      }
      // If a direct candidate already has a revision-verified snippet from vector provider, keep it
      if (
        (direct?.snippet && direct.snippet.trim().length > 0) ||
        (forestNode?.snippet && forestNode.snippet.trim().length > 0)
      ) {
        continue
      }

      if (signal?.aborted || Date.now() >= deadlineAt) {
        onBudgetExhausted()
        break
      }

      if (hydratedNoteCount >= FOREST_HYDRATION_BUDGETS.maxHydratedNotes) {
        addTruncated('budget_exhausted')
        break
      }

      const file = this.deps.app.vault.getFileByPath?.(path)
      if (!file) {
        continue
      }

      const expectedMtime = cacheEntry.expectedMtimeByPath.get(path)
      if (expectedMtime !== undefined && file.stat.mtime !== expectedMtime) {
        stalePathsSet.add(path)
        addTruncated('revision_mismatch')
        if (forestNode) {
          this.pruneStaleNodesAndSubtrees(
            result,
            cacheEntry,
            stalePathsSet,
            addTruncated,
          )
        }
        continue
      }

      const statBytes = Math.max(0, file.stat?.size ?? 0)
      const remainingBytes =
        FOREST_HYDRATION_BUDGETS.maxHydratedBytes - hydratedBytes
      if (statBytes > remainingBytes) {
        addTruncated('budget_exhausted')
        continue
      }

      let content = ''
      try {
        content = await this.deps.app.vault.cachedRead(file)
      } catch {
        continue
      }

      // Post-read revision and UTF-8 byte budget verification (§13.1 item 4)
      if (expectedMtime !== undefined && file.stat.mtime !== expectedMtime) {
        stalePathsSet.add(path)
        addTruncated('revision_mismatch')
        if (forestNode) {
          this.pruneStaleNodesAndSubtrees(
            result,
            cacheEntry,
            stalePathsSet,
            addTruncated,
          )
        }
        continue
      }

      const actualBytes = Math.max(
        statBytes,
        Buffer.byteLength(content, 'utf8'),
      )
      if (actualBytes > remainingBytes) {
        addTruncated('budget_exhausted')
        continue
      }

      hydratedNoteCount += 1
      hydratedBytes += actualBytes

      const revision = `${file.stat.mtime}:${file.stat.size}`
      let snippet = ''
      let heading: string | null = null

      if (
        forestNode &&
        !forestNode.isDirectCandidate &&
        forestNode.parentPath
      ) {
        const mention = findMentionContext(
          content,
          forestNode.relationToParent === 'backlink'
            ? forestNode.parentPath
            : forestNode.path,
        )
        snippet = mention.snippet
        heading = mention.heading
      } else {
        snippet = buildSnippet(content, result.query || file.basename)
        heading = findBestHeading(content, result.query || file.basename)
      }

      const locator = computeSnippetLocator(path, content, snippet, revision)

      if (direct) {
        direct.snippet = snippet
        direct.heading = heading
        direct.locator = direct.locator ?? locator
        direct.revision = revision
      }
      if (forestNode) {
        forestNode.snippet = snippet
        forestNode.heading = heading
        forestNode.locator = forestNode.locator ?? locator
        forestNode.revision = revision
      }
    }

    return { hydratedNoteCount, hydratedBytes }
  }
}

function computeSnippetLocator(
  path: string,
  content: string,
  snippet: string,
  revision: string,
): ChunkLocator {
  const lines = content.split('\n')
  const totalLines = Math.max(1, lines.length)
  const probe = snippet.trim().slice(0, 48).toLowerCase()
  if (!probe) {
    return {
      unitId: `forest:${path}:L1-${Math.min(10, totalLines)}`,
      path,
      startLine: 1,
      endLine: Math.min(10, totalLines),
      revisionHash: revision,
    }
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].toLowerCase().includes(probe.slice(0, 24))) {
      const startLine = Math.max(1, i)
      const endLine = Math.min(totalLines, i + 4)
      return {
        unitId: `forest:${path}:L${startLine}-${endLine}`,
        path,
        startLine,
        endLine,
        revisionHash: revision,
      }
    }
  }
  return {
    unitId: `forest:${path}:L1-${Math.min(10, totalLines)}`,
    path,
    startLine: 1,
    endLine: Math.min(10, totalLines),
    revisionHash: revision,
  }
}
