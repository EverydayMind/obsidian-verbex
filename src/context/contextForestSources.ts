import { App, CachedMetadata, normalizePath } from 'obsidian'

import { Bm25Index } from '../core/rag/bm25'
import type {
  ContextForestFrontmatterEdge,
  ContextForestGraphNodeInput,
} from '../core/rag/contextForestBuilder'
import {
  type RawSourceCandidate,
  buildTopTfIdfVector,
  computeCorpusIdf,
  normalizeTagName,
} from '../core/rag/contextForestScorer'
import type { NormalizedContextForestParams } from '../core/rag/contextForestTypes'
import { dailyNoteExclusion } from '../core/rag/dailyNoteFilter'
import {
  extractMarkdownLinkReferences,
  resolveLinkedMarkdownFile,
} from '../core/rag/linkedMarkdown'
import { selectEvenlyDistributed } from '../core/rag/relatedNotes'
import type { ChunkLocator } from '../core/rag/retrievalTypes'
import { runtimeTimers } from '../platform/runtime'
import { VerbexSettings } from '../settings/schema/setting.types'

import type { SemanticSearchProvider } from './ContextBuilder'
import {
  type LexicalDocument,
  type LexicalIndexSnapshot,
  matchesVaultPattern,
} from './LexicalIndex'

export const FOREST_IO_BUDGETS = {
  maxDenseBridgePaths: 50,
  maxRepresentativeChunksPerPath: 3,
  maxRepresentativeRowsTotal: 150,
  metadataPageSize: 128,
  maxMetadataScanRows: 4096,
  maxEmbeddingPayloadBytes: 8 * 1024 * 1024,
  vectorSearchInitialLimit: 120,
  vectorSearchExpandedLimit: 240,
} as const

export type ScopedLexicalGraphCacheEntry = {
  key: string
  lexicalGeneration: number
  scopeFingerprint: string
  allowedDocCount: number
  excludedDocCount: number
  allowedDocsByPath: Map<string, LexicalDocument>
  expectedMtimeByPath: Map<string, number>
  expectedRevisionByPath: Map<string, string>
  scopedBm25: Bm25Index
  termDfMap: Map<string, number>
  tagDfMap: Map<string, number>
  graphNodesByPath: Map<string, ContextForestGraphNodeInput>
  linksSignature: string
}

export class SingleFlightSqlGate {
  private inFlightPromise: Promise<unknown> | null = null

  hasUnsettledQuery(): boolean {
    return this.inFlightPromise !== null
  }

  async run<T>(
    task: () => Promise<T>,
    options: {
      deadlineAt: number
      signal?: AbortSignal
      onBudgetExhausted?: () => void
    },
  ): Promise<T | null> {
    if (options.signal?.aborted || Date.now() >= options.deadlineAt) {
      options.onBudgetExhausted?.()
      return null
    }

    while (this.inFlightPromise !== null) {
      const remainingMs = options.deadlineAt - Date.now()
      if (remainingMs <= 0 || options.signal?.aborted) {
        options.onBudgetExhausted?.()
        return null
      }
      const settled = await Promise.race([
        this.inFlightPromise.then(
          () => true,
          () => true,
        ),
        new Promise<boolean>((resolve) =>
          runtimeTimers.setTimeout(() => resolve(false), remainingMs),
        ),
      ])
      if (!settled) {
        options.onBudgetExhausted?.()
        return null
      }
    }

    if (options.signal?.aborted || Date.now() >= options.deadlineAt) {
      options.onBudgetExhausted?.()
      return null
    }

    const remainingMs = Math.max(1, options.deadlineAt - Date.now())
    const execution = Promise.resolve().then(task)
    const tracked = execution.finally(() => {
      if (this.inFlightPromise === tracked) {
        this.inFlightPromise = null
      }
    })
    this.inFlightPromise = tracked

    let timer: ReturnType<typeof runtimeTimers.setTimeout> | null = null
    try {
      const raced = await Promise.race([
        execution.then((value) => ({ ok: true as const, value })),
        new Promise<{ ok: false }>((resolve) => {
          timer = runtimeTimers.setTimeout(
            () => resolve({ ok: false }),
            remainingMs,
          )
        }),
      ])
      if (!raced.ok) {
        options.onBudgetExhausted?.()
        return null
      }
      return raced.value
    } finally {
      if (timer !== null) {
        runtimeTimers.clearTimeout(timer)
      }
    }
  }
}

export function computeScopeFingerprint(
  settings: VerbexSettings,
  params: NormalizedContextForestParams,
): string {
  const parts = [
    `folder:${params.scope.folder ? normalizePath(params.scope.folder) : ''}`,
    `inc:${[...params.scope.includePaths, ...settings.ragOptions.includePatterns].map(normalizePath).sort().join('|')}`,
    `exc:${[...params.scope.excludePaths, ...settings.verbex.search.excludePaths, ...settings.ragOptions.excludePatterns].map(normalizePath).sort().join('|')}`,
    `daily:${params.scope.excludeDailyNotes ? '1' : '0'}`,
  ]
  return parts.join(';')
}

export function createPathScopePredicate(
  app: App,
  settings: VerbexSettings,
  params: NormalizedContextForestParams,
): (rawPath: string) => boolean {
  const normalizedFolder = params.scope.folder
    ? normalizePath(params.scope.folder).replace(/\/$/, '')
    : undefined
  const excludePatterns = [
    ...settings.verbex.search.excludePaths,
    ...settings.ragOptions.excludePatterns,
    ...params.scope.excludePaths,
  ].filter(Boolean)
  const settingsIncludePatterns =
    settings.ragOptions.includePatterns.filter(Boolean)
  const paramIncludePatterns = params.scope.includePaths.filter(Boolean)
  const pluginDailyMatcher = params.scope.excludeDailyNotes
    ? dailyNoteExclusion(app, true)
    : undefined
  const isDailyNote = params.scope.excludeDailyNotes
    ? (path: string): boolean => {
        if (pluginDailyMatcher) {
          try {
            return pluginDailyMatcher(path)
          } catch {
            // Fall through to standard YYYY-MM-DD filename check when moment mock is absent
          }
        }
        return /^(?:.*\/)?\d{4}-\d{2}-\d{2}\.md$/i.test(path)
      }
    : null

  return (rawPath: string): boolean => {
    const path = normalizePath(rawPath)
    if (!path || !path.toLowerCase().endsWith('.md')) {
      return false
    }
    if (isDailyNote?.(path)) {
      return false
    }
    if (normalizedFolder) {
      if (
        path !== normalizedFolder &&
        !path.startsWith(`${normalizedFolder}/`)
      ) {
        return false
      }
    }
    for (const pattern of excludePatterns) {
      if (matchesVaultPattern(path, pattern)) {
        return false
      }
    }
    if (
      settingsIncludePatterns.length > 0 &&
      !settingsIncludePatterns.some((pattern) =>
        matchesVaultPattern(path, pattern),
      )
    ) {
      return false
    }
    if (
      paramIncludePatterns.length > 0 &&
      !paramIncludePatterns.some((pattern) =>
        matchesVaultPattern(path, pattern),
      )
    ) {
      return false
    }
    return true
  }
}

function extractFrontmatterEdgesForFile(
  app: App,
  sourcePath: string,
  cache: CachedMetadata | null,
): ContextForestFrontmatterEdge[] {
  const frontmatter = cache?.frontmatter
  if (!frontmatter || typeof frontmatter !== 'object') {
    return []
  }
  const edges: ContextForestFrontmatterEdge[] = []
  const seenTargets = new Set<string>()

  const collectRefs = (value: unknown, field: string): string[] => {
    if (Array.isArray(value)) {
      return value.flatMap((item) => collectRefs(item, field))
    }
    if (typeof value !== 'string') {
      return []
    }
    const raw = value.trim()
    if (!raw) {
      return []
    }
    const parsed = extractMarkdownLinkReferences(raw).map((ref) => ref.target)
    if (parsed.length > 0) {
      return parsed
    }
    if (/(?:link|ref|related|parent|source|next|prev)/i.test(field)) {
      return [raw]
    }
    return []
  }

  for (const [field, value] of Object.entries(frontmatter)) {
    if (
      field === 'position' ||
      field === 'tags' ||
      field === 'tag' ||
      field === 'aliases' ||
      field === 'alias'
    ) {
      continue
    }
    for (const rawTarget of collectRefs(value, field)) {
      const resolved = resolveLinkedMarkdownFile({
        app,
        sourcePath,
        linkTarget: rawTarget,
      })
      if (!resolved || resolved.path === sourcePath) {
        continue
      }
      if (!seenTargets.has(resolved.path)) {
        seenTargets.add(resolved.path)
        edges.push({ targetPath: resolved.path, field })
      }
    }
  }
  return edges
}

export function computeResolvedLinksSignature(
  app: App,
  allowedPaths: Iterable<string>,
): string {
  const resolvedLinks = app.metadataCache?.resolvedLinks
  if (!resolvedLinks) {
    return 'no-resolved-links'
  }
  let edgeCount = 0
  let pathCount = 0
  for (const path of allowedPaths) {
    pathCount += 1
    const targets = resolvedLinks[path]
    if (targets) {
      edgeCount += Object.keys(targets).length
    }
  }
  return `${pathCount}:${edgeCount}`
}

export function buildScopedLexicalGraphCacheEntry(input: {
  app: App
  settings: VerbexSettings
  params: NormalizedContextForestParams
  lexicalGeneration: number
  snapshot: LexicalIndexSnapshot
}): ScopedLexicalGraphCacheEntry {
  const { app, settings, params, lexicalGeneration, snapshot } = input
  const scopeFingerprint = computeScopeFingerprint(settings, params)
  const isAllowed = createPathScopePredicate(app, settings, params)

  const allowedDocs: LexicalDocument[] = []
  const allowedDocsByPath = new Map<string, LexicalDocument>()
  const expectedMtimeByPath = new Map<string, number>()
  const expectedRevisionByPath = new Map<string, string>()
  let excludedDocCount = 0

  for (const doc of snapshot.documents) {
    if (doc.sourceKind === 'document') continue
    if (!isAllowed(doc.path)) {
      excludedDocCount += 1
      continue
    }
    const liveFile = app.vault.getFileByPath?.(doc.path)
    // Preserve the snapshot's indexed mtime so any subsequent file edit before
    // lexical index reconciliation is detected as a revision mismatch.
    const indexedMtime =
      typeof doc.mtime === 'number' && Number.isFinite(doc.mtime)
        ? doc.mtime
        : (liveFile?.stat?.mtime ?? 0)
    const size = liveFile?.stat?.size ?? doc.length
    allowedDocs.push(doc)
    allowedDocsByPath.set(doc.path, doc)
    expectedMtimeByPath.set(doc.path, indexedMtime)
    expectedRevisionByPath.set(doc.path, `${indexedMtime}:${size}`)
  }

  const termDfMap = new Map<string, number>()
  const tagDfMap = new Map<string, number>()
  for (const doc of allowedDocs) {
    for (const [term, tf] of Object.entries(doc.termFreq ?? {})) {
      if (Number.isFinite(tf) && tf > 0) {
        termDfMap.set(term, (termDfMap.get(term) ?? 0) + 1)
      }
    }
    const uniqueTags = new Set(
      (doc.tags ?? []).map(normalizeTagName).filter(Boolean),
    )
    for (const tag of uniqueTags) {
      tagDfMap.set(tag, (tagDfMap.get(tag) ?? 0) + 1)
    }
  }

  const allowedDocCount = allowedDocs.length
  const getTermIdf = (term: string) =>
    computeCorpusIdf(allowedDocCount, termDfMap.get(term) ?? 0)
  const scopedBm25 = Bm25Index.fromTermFreqs(allowedDocs)

  const resolvedLinks = app.metadataCache?.resolvedLinks ?? {}
  const graphNodesByPath = new Map<string, ContextForestGraphNodeInput>()

  for (const doc of allowedDocs) {
    const file = app.vault.getFileByPath?.(doc.path)
    const cache = file
      ? (app.metadataCache?.getFileCache?.(file) ?? null)
      : null

    const outgoingFrontmatter = extractFrontmatterEdgesForFile(
      app,
      doc.path,
      cache,
    ).filter((edge) => allowedDocsByPath.has(edge.targetPath))
    const frontmatterTargetSet = new Set(
      outgoingFrontmatter.map((edge) => edge.targetPath),
    )

    const outgoingWikilinks = new Set<string>()
    if (cache?.links && Array.isArray(cache.links)) {
      for (const linkCache of cache.links) {
        if (!linkCache?.link) continue
        const resolved = resolveLinkedMarkdownFile({
          app,
          sourcePath: doc.path,
          linkTarget: linkCache.link,
        })
        if (
          resolved &&
          resolved.path !== doc.path &&
          allowedDocsByPath.has(resolved.path)
        ) {
          outgoingWikilinks.add(resolved.path)
        }
      }
    } else {
      // Fallback to LexicalDocument.links (body markdown link targets) + resolvedLinks
      const bodyTargets = new Set<string>()
      for (const rawTarget of doc.links ?? []) {
        const resolved = resolveLinkedMarkdownFile({
          app,
          sourcePath: doc.path,
          linkTarget: rawTarget,
        })
        if (
          resolved &&
          resolved.path !== doc.path &&
          allowedDocsByPath.has(resolved.path)
        ) {
          bodyTargets.add(resolved.path)
        }
      }
      if (bodyTargets.size > 0) {
        for (const target of bodyTargets) {
          if (!frontmatterTargetSet.has(target)) {
            outgoingWikilinks.add(target)
          }
        }
      } else {
        const resolvedForDoc = resolvedLinks[doc.path]
        if (resolvedForDoc && typeof resolvedForDoc === 'object') {
          for (const targetPath of Object.keys(resolvedForDoc)) {
            if (
              targetPath !== doc.path &&
              allowedDocsByPath.has(targetPath) &&
              !frontmatterTargetSet.has(targetPath)
            ) {
              outgoingWikilinks.add(targetPath)
            }
          }
        }
      }
    }

    const tfIdfVector = buildTopTfIdfVector(doc.termFreq ?? {}, getTermIdf)
    graphNodesByPath.set(doc.path, {
      path: doc.path,
      title: doc.title,
      revision: expectedRevisionByPath.get(doc.path),
      outgoingWikilinks: [...outgoingWikilinks],
      outgoingFrontmatter,
      tags: doc.tags ?? [],
      tfIdfVector,
    })
  }

  const linksSignature = computeResolvedLinksSignature(
    app,
    allowedDocsByPath.keys(),
  )

  return {
    key: `${lexicalGeneration}:${scopeFingerprint}`,
    lexicalGeneration,
    scopeFingerprint,
    allowedDocCount,
    excludedDocCount,
    allowedDocsByPath,
    expectedMtimeByPath,
    expectedRevisionByPath,
    scopedBm25,
    termDfMap,
    tagDfMap,
    graphNodesByPath,
    linksSignature,
  }
}

export function searchScopedLexicalCandidates(
  cacheEntry: ScopedLexicalGraphCacheEntry,
  query: string,
  limit = 30,
): RawSourceCandidate[] {
  if (!query.trim() || cacheEntry.allowedDocCount === 0) {
    return []
  }
  const allowedDocs = [...cacheEntry.allowedDocsByPath.values()]
  const rawHits = cacheEntry.scopedBm25.search(query)
  const candidates: RawSourceCandidate[] = []
  for (const hit of rawHits) {
    const doc = allowedDocs[hit.index]
    if (!doc) continue
    candidates.push({
      path: doc.path,
      title: doc.title,
      score: hit.score,
      revision: cacheEntry.expectedRevisionByPath.get(doc.path),
    })
    if (candidates.length >= limit) {
      break
    }
  }
  return candidates
}

export async function fetchScopedVectorDirectCandidates(input: {
  app: App
  query: string
  provider: SemanticSearchProvider | null
  isAllowedPath: (path: string) => boolean
  expectedMtimeByPath: ReadonlyMap<string, number>
  expectedRevisionByPath: ReadonlyMap<string, string>
  sqlGate: SingleFlightSqlGate
  deadlineAt: number
  signal?: AbortSignal
  maxCandidates?: number
  onDbQueryExecuted?: () => void
  onBudgetExhausted?: () => void
  onStalePathDropped?: (path: string) => void
}): Promise<{
  vectorActive: boolean
  candidates: RawSourceCandidate[]
}> {
  const {
    app,
    query,
    provider,
    isAllowedPath,
    expectedMtimeByPath,
    expectedRevisionByPath,
    sqlGate,
    deadlineAt,
    signal,
    maxCandidates = 30,
  } = input

  if (!provider || !query.trim()) {
    return { vectorActive: false, candidates: [] }
  }
  if (
    typeof provider.isSemanticSearchReady === 'function' &&
    !provider.isSemanticSearchReady()
  ) {
    return { vectorActive: false, candidates: [] }
  }

  const vectorManager = provider.getVectorManager?.() ?? null
  const embeddingModel = provider.getEmbeddingModel?.() ?? null

  // Path 1: Metadata-only SQL vector similarity search (zero chunk body transfer)
  if (
    vectorManager &&
    embeddingModel &&
    typeof vectorManager.performSimilaritySearchMetadata === 'function'
  ) {
    try {
      if (signal?.aborted || Date.now() >= deadlineAt) {
        input.onBudgetExhausted?.()
        return { vectorActive: false, candidates: [] }
      }
      const queryVector = await embeddingModel.getEmbedding(query)
      const collectValidCandidates = (
        rows: Awaited<
          ReturnType<typeof vectorManager.performSimilaritySearchMetadata>
        >,
      ): RawSourceCandidate[] => {
        const bestByPath = new Map<
          string,
          {
            score: number
            startLine: number
            id: number
            locator: ChunkLocator
            revision: string
          }
        >()
        for (const row of rows) {
          if (!isAllowedPath(row.path)) {
            continue
          }
          const liveFile = app.vault.getFileByPath?.(row.path)
          const expectedMtime =
            liveFile?.stat?.mtime ?? expectedMtimeByPath.get(row.path)
          if (expectedMtime !== undefined && row.mtime !== expectedMtime) {
            input.onStalePathDropped?.(row.path)
            continue
          }
          const revision =
            expectedRevisionByPath.get(row.path) ??
            `${row.mtime}:${liveFile?.stat?.size ?? 0}`
          const startLine = row.metadata?.startLine ?? 1
          const endLine = row.metadata?.endLine ?? startLine
          const existing = bestByPath.get(row.path)
          const isBetter =
            !existing ||
            row.similarity > existing.score ||
            (row.similarity === existing.score &&
              (startLine < existing.startLine ||
                (startLine === existing.startLine && row.id < existing.id)))
          if (isBetter) {
            bestByPath.set(row.path, {
              score: row.similarity,
              startLine,
              id: row.id,
              revision,
              locator: {
                unitId: `chunk:${row.id}`,
                path: row.path,
                startLine,
                endLine,
                revisionHash: revision,
              },
            })
          }
        }
        return [...bestByPath.entries()]
          .sort((a, b) => {
            if (b[1].score !== a[1].score) {
              return b[1].score - a[1].score
            }
            return a[0].localeCompare(b[0])
          })
          .slice(0, maxCandidates)
          .map(([path, entry]) => ({
            path,
            score: entry.score,
            locator: entry.locator,
            revision: entry.revision,
          }))
      }

      const initialRows = await sqlGate.run(
        () => {
          input.onDbQueryExecuted?.()
          return vectorManager.performSimilaritySearchMetadata(
            queryVector,
            embeddingModel,
            {
              minSimilarity: 0,
              limit: FOREST_IO_BUDGETS.vectorSearchInitialLimit,
            },
          )
        },
        {
          deadlineAt,
          signal,
          onBudgetExhausted: input.onBudgetExhausted,
        },
      )
      if (initialRows === null) {
        return { vectorActive: false, candidates: [] }
      }

      let candidates = collectValidCandidates(initialRows)
      if (
        candidates.length < maxCandidates &&
        initialRows.length >= FOREST_IO_BUDGETS.vectorSearchInitialLimit &&
        Date.now() < deadlineAt &&
        !signal?.aborted
      ) {
        const expandedRows = await sqlGate.run(
          () => {
            input.onDbQueryExecuted?.()
            return vectorManager.performSimilaritySearchMetadata(
              queryVector,
              embeddingModel,
              {
                minSimilarity: 0,
                limit: FOREST_IO_BUDGETS.vectorSearchExpandedLimit,
              },
            )
          },
          {
            deadlineAt,
            signal,
            onBudgetExhausted: input.onBudgetExhausted,
          },
        )
        if (expandedRows !== null) {
          candidates = collectValidCandidates(expandedRows)
        }
      }
      return { vectorActive: true, candidates }
    } catch {
      return { vectorActive: false, candidates: [] }
    }
  }

  // Path 2: Provider fallback (e.g., processQueryHits / processQuery in lightweight providers)
  try {
    if (provider.processQueryHits) {
      const hits = await provider.processQueryHits({
        query,
        hitSelection: {
          limit: FOREST_IO_BUDGETS.vectorSearchInitialLimit,
          maxPerPath: 1,
          expandAdjacent: false,
          expandGraph: false,
        },
      })
      const bestByPath = new Map<string, RawSourceCandidate>()
      for (const hit of hits) {
        const path = hit.locator.path
        if (!isAllowedPath(path)) continue
        const expectedRevision = expectedRevisionByPath.get(path)
        const expectedMtime = expectedMtimeByPath.get(path)
        if (
          expectedRevision &&
          hit.locator.revisionHash &&
          hit.locator.revisionHash !== 'unknown' &&
          hit.locator.revisionHash !== expectedRevision &&
          (expectedMtime === undefined ||
            !hit.locator.revisionHash.startsWith(`${expectedMtime}:`))
        ) {
          input.onStalePathDropped?.(path)
          continue
        }
        const score =
          hit.scores.vector ?? hit.scores.final ?? hit.scores.bm25 ?? 0
        if (!Number.isFinite(score) || score <= 0) continue
        const existing = bestByPath.get(path)
        if (!existing || score > existing.score) {
          bestByPath.set(path, {
            path,
            score,
            snippet: hit.content,
            locator: hit.locator,
            revision: expectedRevision ?? hit.locator.revisionHash,
            provenance: hit.provenance,
          })
        }
      }
      const candidates = [...bestByPath.values()]
        .sort((a, b) =>
          b.score !== a.score
            ? b.score - a.score
            : a.path.localeCompare(b.path),
        )
        .slice(0, maxCandidates)
      return { vectorActive: true, candidates }
    }

    const basicResults = await provider.processQuery({ query })
    const bestByPath = new Map<string, RawSourceCandidate>()
    for (const item of basicResults) {
      if (!isAllowedPath(item.path)) continue
      const existing = bestByPath.get(item.path)
      if (!existing || item.similarity > existing.score) {
        bestByPath.set(item.path, {
          path: item.path,
          score: item.similarity,
          snippet: item.content,
          locator: item.locator,
          revision:
            expectedRevisionByPath.get(item.path) ?? item.locator?.revisionHash,
          provenance: item.provenance,
        })
      }
    }
    const candidates = [...bestByPath.values()]
      .sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.path.localeCompare(b.path),
      )
      .slice(0, maxCandidates)
    return { vectorActive: true, candidates }
  } catch {
    return { vectorActive: false, candidates: [] }
  }
}

export async function fetchRepresentativeChunkEmbeddings(input: {
  app: App
  candidatePaths: readonly string[]
  provider: SemanticSearchProvider | null
  expectedMtimeByPath: ReadonlyMap<string, number>
  sqlGate: SingleFlightSqlGate
  deadlineAt: number
  signal?: AbortSignal
  onDbQueryExecuted?: () => void
  onBudgetExhausted?: () => void
  onStalePathDropped?: (path: string) => void
}): Promise<{
  chunksByPath: Map<string, number[][]>
  representativeRowsLoaded: number
  scanCapExceededPaths: string[]
}> {
  const chunksByPath = new Map<string, number[][]>()
  const scanCapExceededPaths: string[] = []
  const {
    app,
    candidatePaths,
    provider,
    expectedMtimeByPath,
    sqlGate,
    deadlineAt,
    signal,
  } = input

  if (!provider || candidatePaths.length === 0) {
    return {
      chunksByPath,
      representativeRowsLoaded: 0,
      scanCapExceededPaths,
    }
  }
  const vectorManager = provider.getVectorManager?.() ?? null
  const embeddingModel = provider.getEmbeddingModel?.() ?? null
  if (
    !vectorManager ||
    !embeddingModel ||
    typeof vectorManager.getVectorChunkMetadataPageByPath !== 'function' ||
    typeof vectorManager.getVectorEmbeddingsByIds !== 'function'
  ) {
    return {
      chunksByPath,
      representativeRowsLoaded: 0,
      scanCapExceededPaths,
    }
  }

  const boundedPaths = Array.from(new Set(candidatePaths)).slice(
    0,
    FOREST_IO_BUDGETS.maxDenseBridgePaths,
  )
  let totalScannedRows = 0
  const selectedIdsByPath = new Map<string, number[]>()
  const allSelectedIds: number[] = []

  for (const path of boundedPaths) {
    if (signal?.aborted || Date.now() >= deadlineAt) {
      input.onBudgetExhausted?.()
      break
    }
    const liveFile = app.vault.getFileByPath?.(path)
    const expectedMtime = liveFile?.stat?.mtime ?? expectedMtimeByPath.get(path)

    const validRowsForPath: {
      id: number
      startLine: number
    }[] = []
    let afterId: number | undefined = undefined
    let scanIncomplete = false
    let hadStaleRow = false
    const hasMorePages = true

    while (hasMorePages) {
      if (totalScannedRows >= FOREST_IO_BUDGETS.maxMetadataScanRows) {
        scanIncomplete = true
        break
      }
      const remainingScanBudget =
        FOREST_IO_BUDGETS.maxMetadataScanRows - totalScannedRows
      const pageLimit = Math.min(
        FOREST_IO_BUDGETS.metadataPageSize,
        remainingScanBudget,
      )
      const page = await sqlGate.run(
        () => {
          input.onDbQueryExecuted?.()
          return vectorManager.getVectorChunkMetadataPageByPath(
            path,
            embeddingModel,
            {
              afterId,
              limit: pageLimit,
            },
          )
        },
        {
          deadlineAt,
          signal,
          onBudgetExhausted: input.onBudgetExhausted,
        },
      )
      if (page === null) {
        scanIncomplete = true
        break
      }
      totalScannedRows += page.length
      for (const row of page) {
        if (expectedMtime !== undefined && row.mtime !== expectedMtime) {
          hadStaleRow = true
          continue
        }
        validRowsForPath.push({
          id: row.id,
          startLine: row.metadata?.startLine ?? 1,
        })
      }
      if (page.length < pageLimit) {
        break
      }
      if (totalScannedRows >= FOREST_IO_BUDGETS.maxMetadataScanRows) {
        scanIncomplete = true
        break
      }
      afterId = page[page.length - 1]?.id
      if (afterId === undefined) {
        break
      }
    }

    if (scanIncomplete) {
      // Do not use a partial prefix of chunks when the scan cap or deadline
      // prevented seeing the full note; mark D unavailable (null) for this path.
      scanCapExceededPaths.push(path)
      continue
    }

    if (validRowsForPath.length === 0) {
      if (hadStaleRow) {
        input.onStalePathDropped?.(path)
      }
      continue
    }

    const picked = selectEvenlyDistributed(
      validRowsForPath,
      FOREST_IO_BUDGETS.maxRepresentativeChunksPerPath,
      (row) => row.startLine,
      (row) => row.id,
    )
    const bytesPerRow = Math.max(1, embeddingModel.dimension || 1536) * 8
    const pickedIds: number[] = []
    for (const item of picked) {
      if (
        allSelectedIds.length >= FOREST_IO_BUDGETS.maxRepresentativeRowsTotal
      ) {
        break
      }
      if (
        (allSelectedIds.length + 1) * bytesPerRow >
        FOREST_IO_BUDGETS.maxEmbeddingPayloadBytes
      ) {
        break
      }
      pickedIds.push(item.id)
      allSelectedIds.push(item.id)
    }
    if (pickedIds.length > 0) {
      selectedIdsByPath.set(path, pickedIds)
    }
  }

  if (allSelectedIds.length === 0) {
    return {
      chunksByPath,
      representativeRowsLoaded: 0,
      scanCapExceededPaths,
    }
  }

  const hydratedRows = await sqlGate.run(
    () => {
      input.onDbQueryExecuted?.()
      return vectorManager.getVectorEmbeddingsByIds(
        allSelectedIds,
        embeddingModel,
      )
    },
    {
      deadlineAt,
      signal,
      onBudgetExhausted: input.onBudgetExhausted,
    },
  )
  if (!hydratedRows) {
    return {
      chunksByPath,
      representativeRowsLoaded: 0,
      scanCapExceededPaths,
    }
  }

  const embeddingById = new Map<number, { mtime: number; vec: number[] }>()
  for (const row of hydratedRows) {
    if (Array.isArray(row.embedding) && row.embedding.length > 0) {
      embeddingById.set(row.id, {
        mtime: row.mtime,
        vec: row.embedding,
      })
    }
  }

  let representativeRowsLoaded = 0
  for (const [path, ids] of selectedIdsByPath.entries()) {
    const liveFile = app.vault.getFileByPath?.(path)
    const expectedMtime = liveFile?.stat?.mtime ?? expectedMtimeByPath.get(path)
    const vectors: number[][] = []
    for (const id of ids) {
      const entry = embeddingById.get(id)
      if (!entry) continue
      if (expectedMtime !== undefined && entry.mtime !== expectedMtime) {
        input.onStalePathDropped?.(path)
        continue
      }
      vectors.push(entry.vec)
      representativeRowsLoaded += 1
    }
    if (vectors.length > 0) {
      chunksByPath.set(path, vectors)
    }
  }

  return {
    chunksByPath,
    representativeRowsLoaded,
    scanCapExceededPaths,
  }
}
