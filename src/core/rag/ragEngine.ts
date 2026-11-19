import { App, TFile } from 'obsidian'

import { LexicalIndexRepository } from '../../context/LexicalIndex'
import {
  EMBEDDING_FAILURE_NOTICE_DURATION_MS,
  VectorManager,
  classifyEmbeddingError,
  embeddingErrorUi,
  showEmbeddingErrorNotice,
} from '../../database/modules/vector/VectorManager'
import { SelectEmbedding } from '../../database/schema'
import { runtimeTimers } from '../../platform/runtime'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import { VerbexSettings } from '../../settings/schema/setting.types'
import { EmbeddingModelClient } from '../../types/embedding'
import { IndexProgress, QueryProgressState } from '../../types/queryProgress'
import { RequestTimeoutError } from '../../utils/llm/httpTransport'
import {
  type RetrievalDiversityOptions,
  selectDirectThenGraphHits,
  selectDiverseRetrievalHits,
} from '../routing/retrievalRouting'

import { Bm25Index, computeTermFreq } from './bm25'
import { dailyNoteExclusion } from './dailyNoteFilter'
import { groupDocumentResults } from './documentSources/companions'
import {
  hasExcludedType,
  isDocumentPath,
  shouldIndexSource,
} from './documentSources/indexableSources'
import { extractorKey } from './documentSources/projection'
import { getEmbeddingModelClient } from './embedding'
import { embeddingSettingsChanged } from './embeddingIndexHold'
import type { EmbeddingIndexMutation } from './embeddingIndexQueue'
import {
  getActiveEmbeddingModelId,
  isEmbeddingIndexReady,
} from './embeddingIndexState'
import {
  type DiscoveredGraphRelation,
  discoverAdjacentChunks,
  discoverBacklinkIn,
  discoverFolderAdjacentRelations,
  discoverFrontmatterReferences,
  discoverSharedTagRelations,
  discoverWikilinkOut,
} from './graphRelationDiscovery'
import {
  type MaterializeGraphRelationsDeps,
  materializeGraphRelation,
} from './graphRelationMaterialization'
import {
  extractMarkdownLinkReferences,
  resolveLinkedMarkdownFile,
} from './linkedMarkdown'
import {
  RELATED_VECTOR_QUERY_LIMIT,
  type RelatedCandidate,
  type RelatedNote,
  discoverRelatedGraphRelations,
  groupIntoRelatedNotes,
  isRelatedNotesAbort,
  materializeRelatedGraphCandidates,
  selectEvenlyDistributed,
  throwIfRelatedNotesAborted,
} from './relatedNotes'
import {
  type LegacyQueryResult,
  queryResultToChunkLocator,
  queryResultToRetrievalHit,
  queryResultsToRetrievalHits,
} from './retrievalAdapter'
import {
  type RetrievalFusionStrategy,
  fuseRankedScores,
} from './retrievalFusion'
import {
  expandConditionalAdjacentRetrievalHits,
  hydrateRetrievalHits,
  resolveAnchorLineRange,
  sliceInclusiveLines,
} from './retrievalHydration'
import type {
  ChunkLocator,
  RetrievalHit,
  RetrievalProvenance,
} from './retrievalTypes'
import { SourceTextReader } from './sourceTextReader'

export type QueryResult = LegacyQueryResult

type IndexedChunkCandidate = Omit<SelectEmbedding, 'embedding' | 'content'> & {
  content?: string
}

/** Candidate rows may omit content until the final hydration phase. */
type QueryCandidate = IndexedChunkCandidate & { similarity: number }

/** Provenance is kept by indexed row id until the legacy result is adapted. */
type RetrievalOriginMap = Map<number, Set<RetrievalProvenance>>

class SemanticQueryDeadlineError extends Error {
  constructor(timeoutMs: number) {
    super(`Semantic query exceeded its ${timeoutMs}ms deadline`)
    this.name = 'SemanticQueryDeadlineError'
  }
}

function recordRetrievalOrigins(
  origins: RetrievalOriginMap,
  results: readonly QueryCandidate[],
  provenance: RetrievalProvenance,
): void {
  for (const result of results) {
    const existing = origins.get(result.id) ?? new Set<RetrievalProvenance>()
    existing.add(provenance)
    origins.set(result.id, existing)
  }
}

function directHitScore(hit: RetrievalHit): number {
  const scores = [
    hit.scores.final,
    hit.scores.rerank,
    hit.scores.vector,
    hit.scores.bm25,
  ]
  return scores.find((score): score is number => Number.isFinite(score)) ?? 0
}

function graphRelationPriority(hit: RetrievalHit): number {
  if (hit.provenance.includes('wikilink')) return 0
  if (hit.provenance.includes('backlink')) return 1
  if (hit.provenance.includes('frontmatter_ref')) return 2
  if (hit.provenance.includes('shared_tag')) return 3
  if (hit.provenance.includes('folder_adjacent')) return 4
  if (hit.provenance.includes('adjacent')) return 5
  return 6
}

function parentFolderPath(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

function compactRelatedSnippet(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  return compact.length > 600 ? `${compact.slice(0, 597)}…` : compact
}

function frontmatterReferenceValues(value: unknown, field: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => frontmatterReferenceValues(item, field))
  }
  if (typeof value !== 'string') return []
  const raw = value.trim()
  if (!raw) return []
  const parsed = extractMarkdownLinkReferences(raw).map(
    (reference) => reference.target,
  )
  if (parsed.length > 0) return parsed
  // Bare note names are accepted only for fields conventionally used for
  // references; arbitrary property values must not become graph edges.
  if (/(?:link|ref|related|parent|source|next|prev)/i.test(field)) {
    return [raw]
  }
  return []
}

export type SemanticQueryOutcome =
  | 'vector'
  | 'no_vector_hits'
  | 'embedding_failed'
  | 'deadline'
  | 'not_ready'

export type RAGQueryInput = {
  query: string
  onSemanticOutcome?: (outcome: SemanticQueryOutcome) => void
  scope?: {
    files: string[]
    folders: string[]
  }
  onQueryProgressChange?: (queryProgress: QueryProgressState) => void
  /** Optional deterministic selection policy for the location-aware surface. */
  hitSelection?: RetrievalDiversityOptions
  /** Evaluation-only fusion override; omitted means the legacy weighted sum. */
  fusionStrategy?: RetrievalFusionStrategy
  /** Reciprocal-rank constant used by the optional RRF evaluation modes. */
  rrfK?: number
  /** Cancels an in-flight retrieval request when the active note changes. */
  signal?: AbortSignal
  /**
   * Legacy hit surface only: attach each direct result's retrieval origins
   * (`vector`/`bm25`) as provenance. Tools use it to count only vector hits as
   * semantic; omitted keeps the legacy provenance-free hits.
   */
  withProvenance?: boolean
}

export class RAGEngine {
  private app: App
  private settings: VerbexSettings
  private vectorManager: VectorManager | null = null
  private lexicalIndex: LexicalIndexRepository | null = null
  private embeddingModel: EmbeddingModelClient | null = null
  private vaultIndexDirty = false
  private vaultIndexDirtyVersion = 0
  private vaultIndexUpdatePromise: Promise<boolean> | null = null
  private indexAbortController: AbortController | null = null
  private hasCheckedVaultIndexOnStartup = false
  private semanticSearchReady = true
  /**
   * A failed optional embedding request must not make every subsequent chat
   * turn wait for the provider again. Keep the semantic path in a short
   * cooldown and let BM25 continue serving the request immediately.
   */
  private semanticFailureUntil = 0
  private lastSemanticFailureNoticeAt = 0
  private static readonly SEMANTIC_FAILURE_COOLDOWN_MS = 30_000
  private static readonly SEMANTIC_QUERY_TIMEOUT_MS = 2_000
  // Cache the latest query embeddings to avoid duplicate API calls when
  // the same query is processed multiple times (e.g., regenerations)
  private queryEmbeddingCache = new Map<string, number[]>()
  private static readonly QUERY_EMBEDDING_CACHE_SIZE = 20
  // In-memory BM25 index over the indexed chunks, rebuilt lazily whenever
  // the vault index changes or the embedding model is switched
  private bm25IndexCache: {
    modelId: string
    chunks: IndexedChunkCandidate[]
    index: Bm25Index
  } | null = null
  private indexCacheGeneration = 0
  private indexedChunksCache: {
    modelId: string
    byPath: Map<string, Omit<SelectEmbedding, 'embedding'>[]>
  } | null = null
  private unsubscribeFromIndexMutations: (() => void) | null = null

  constructor(
    app: App,
    settings: VerbexSettings,
    vectorManager: VectorManager,
    lexicalIndex?: LexicalIndexRepository,
    private readonly onEmbeddingRuntimeMissing: () => void = () => {},
    private readonly onIndexActivity: (event: {
      type: 'start' | 'progress' | 'finish'
      source: 'automatic' | 'manual'
      progress?: IndexProgress
      summary?: {
        totalFiles: number
        failedFiles: number
        failedChunks: number
        ok: boolean
      }
    }) => void = () => {},
  ) {
    this.app = app
    this.settings = settings
    this.vectorManager = vectorManager
    this.lexicalIndex = lexicalIndex ?? null
    this.embeddingModel = getEmbeddingModelClient({
      settings,
      embeddingModelId: getActiveEmbeddingModelId(settings),
    })
    this.semanticSearchReady = isEmbeddingIndexReady(settings)
    // Invalidate the BM25 cache on any embedding table mutation, including
    // paths that bypass this engine (e.g. settings UI calling
    // VectorManager.clearAllVectors or updateVaultIndex directly)
    this.unsubscribeFromIndexMutations =
      vectorManager.subscribeToIndexMutations(() => {
        this.invalidateIndexCaches()
      })
  }

  cleanup() {
    this.indexAbortController?.abort()
    this.indexAbortController = null
    this.unsubscribeFromIndexMutations?.()
    this.unsubscribeFromIndexMutations = null
    this.embeddingModel = null
    this.vectorManager = null
    this.queryEmbeddingCache.clear()
    this.invalidateIndexCaches()
    this.vaultIndexDirty = false
    this.vaultIndexDirtyVersion = 0
    this.vaultIndexUpdatePromise = null
    this.hasCheckedVaultIndexOnStartup = false
    this.semanticSearchReady = false
    this.semanticFailureUntil = 0
    this.lastSemanticFailureNoticeAt = 0
  }

  async cancelIndexing(): Promise<void> {
    this.indexAbortController?.abort()
    await this.vaultIndexUpdatePromise?.catch(() => undefined)
  }

  getVectorManager(): VectorManager | null {
    return this.vectorManager
  }

  getEmbeddingModel(): EmbeddingModelClient | null {
    return this.embeddingModel
  }

  isSemanticSearchReady(): boolean {
    return (
      (this.semanticSearchReady ?? true) &&
      this.embeddingModel !== null &&
      (this.semanticFailureUntil ?? 0) <= Date.now()
    )
  }

  semanticStatus():
    | 'model_unset'
    | 'index_not_ready'
    | 'cooling_down'
    | 'ready' {
    if (!this.embeddingModel) return 'model_unset'
    if (!this.semanticSearchReady) return 'index_not_ready'
    if (this.semanticFailureUntil > Date.now()) return 'cooling_down'
    return 'ready'
  }

  setSettings(settings: VerbexSettings) {
    const resetFailure = embeddingSettingsChanged(this.settings, settings)
    const embeddingModelChanged =
      getActiveEmbeddingModelId(this.settings) !==
      getActiveEmbeddingModelId(settings)
    const ragIndexOptionsChanged =
      this.settings.ragOptions.chunkSize !== settings.ragOptions.chunkSize ||
      this.settings.verbex.search.chunkOverlap !==
        settings.verbex.search.chunkOverlap ||
      this.settings.verbex.search.chunkStrategy !==
        settings.verbex.search.chunkStrategy ||
      this.settings.verbex.search.excludeTypes.join('\n') !==
        settings.verbex.search.excludeTypes.join('\n') ||
      this.settings.ragOptions.excludePatterns.join('\n') !==
        settings.ragOptions.excludePatterns.join('\n') ||
      this.settings.ragOptions.includePatterns.join('\n') !==
        settings.ragOptions.includePatterns.join('\n')
    this.settings = settings
    this.lexicalIndex?.setSettings(settings)
    if (resetFailure || this.semanticFailureUntil !== Infinity) {
      this.semanticFailureUntil = 0
      this.lastSemanticFailureNoticeAt = 0
    }
    this.embeddingModel = getEmbeddingModelClient({
      settings,
      embeddingModelId: getActiveEmbeddingModelId(settings),
    })
    this.semanticSearchReady = isEmbeddingIndexReady(settings)
    if (embeddingModelChanged) {
      this.queryEmbeddingCache.clear()
      this.invalidateIndexCaches()
      this.markVaultIndexDirty()
      this.semanticSearchReady = false
    } else if (ragIndexOptionsChanged) {
      this.invalidateIndexCaches()
      this.markVaultIndexDirty()
    }
  }

  private invalidateIndexCaches() {
    this.indexCacheGeneration += 1
    this.bm25IndexCache = null
    this.indexedChunksCache = null
  }

  markVaultIndexDirty() {
    this.vaultIndexDirty = true
    this.vaultIndexDirtyVersion += 1
  }

  markEmbeddingIndexReady() {
    this.vaultIndexDirty = false
    this.hasCheckedVaultIndexOnStartup = true
    this.semanticSearchReady = this.embeddingModel !== null
    this.semanticFailureUntil = 0
    this.lastSemanticFailureNoticeAt = 0
  }

  hasDirtyVaultIndex() {
    return this.vaultIndexDirty
  }

  async updateDirtyVaultIndex(
    onQueryProgressChange?: (queryProgress: QueryProgressState) => void,
    dirtyMutations?: readonly EmbeddingIndexMutation[],
  ): Promise<boolean> {
    if (!this.vaultIndexDirty) {
      return false
    }
    return await this.updateVaultIndex(
      {
        reindexAll: false,
        source: 'automatic',
        // Event-bound mutations describe the newest file state and must not
        // be silently consumed just because the note is currently open. The
        // legacy full-reconcile path keeps its conservative open-file skip.
        skipOpenFiles: dirtyMutations === undefined,
        dirtyMutations,
      },
      onQueryProgressChange,
    )
  }

  async updateVaultIndex(
    options: {
      reindexAll: boolean
      skipOpenFiles?: boolean
      dirtyMutations?: readonly EmbeddingIndexMutation[]
      signal?: AbortSignal
      timeoutMs?: number
      source?: 'automatic' | 'manual'
    } = {
      reindexAll: false,
    },
    onQueryProgressChange?: (queryProgress: QueryProgressState) => void,
  ): Promise<boolean> {
    if (!this.embeddingModel) {
      throw new Error('Embedding model is not set')
    }
    // Wait for any in-flight update. An incremental request is satisfied by
    // the run that just finished, but a full reindex must still run on its
    // own afterwards — otherwise "Rebuild entire vault index" silently
    // degrades to whatever update happened to be running.
    while (this.vaultIndexUpdatePromise) {
      await this.vaultIndexUpdatePromise.catch(() => undefined)
      if (!options.reindexAll) {
        return false
      }
    }
    await this.runIndexUpdate(
      this.embeddingModel,
      options,
      onQueryProgressChange,
    )
    return true
  }

  async rebuildEmbeddingIndex(
    embeddingModel: EmbeddingModelClient,
    onQueryProgressChange?: (indexProgress: IndexProgress) => void,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<void> {
    // An explicit rebuild owns the indexing slot. Finish an incremental run
    // (or cancel it) before clearing and rebuilding the selected model.
    if (this.vaultIndexUpdatePromise) {
      await this.cancelIndexing()
    }
    await this.runIndexUpdate(
      embeddingModel,
      {
        reindexAll: true,
        requireComplete: true,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        source: 'manual',
      },
      onQueryProgressChange
        ? (progress) => {
            if (progress.type === 'indexing') {
              onQueryProgressChange(progress.indexProgress)
            }
          }
        : undefined,
    )
  }

  private async runIndexUpdate(
    embeddingModel: EmbeddingModelClient,
    options: {
      reindexAll: boolean
      skipOpenFiles?: boolean
      requireComplete?: boolean
      dirtyMutations?: readonly EmbeddingIndexMutation[]
      signal?: AbortSignal
      timeoutMs?: number
      source?: 'automatic' | 'manual'
    },
    onQueryProgressChange?: (queryProgress: QueryProgressState) => void,
  ): Promise<void> {
    const dirtyVersionAtStart = this.vaultIndexDirtyVersion
    const controller = new AbortController()
    const forwardAbort = () => controller.abort()
    if (options.signal?.aborted) {
      controller.abort()
    } else {
      options.signal?.addEventListener('abort', forwardAbort, { once: true })
    }
    this.indexAbortController = controller
    const source = options.source ?? 'manual'
    let summary = {
      totalFiles: 0,
      failedFiles: 0,
      failedChunks: 0,
      saved: false,
    }
    this.onIndexActivity({ type: 'start', source })
    const updatePromise =
      this.vectorManager?.updateVaultIndex(
        embeddingModel,
        {
          chunkSize: this.settings.ragOptions.chunkSize,
          chunkOverlap: this.settings.verbex.search.chunkOverlap,
          chunkStrategy: this.settings.verbex.search.chunkStrategy,
          excludePatterns: this.settings.ragOptions.excludePatterns,
          includePatterns: this.settings.ragOptions.includePatterns,
          reindexAll: options.reindexAll,
          excludeOpenFiles: options.skipOpenFiles,
          dirtyMutations: options.dirtyMutations,
          requireComplete:
            options.requireComplete ??
            this.settings.embeddingIndexState?.phase === 'rebuilding',
          signal: controller.signal,
          timeoutMs: options.timeoutMs,
        },
        (indexProgress) => {
          summary.totalFiles = indexProgress.totalFiles
          this.onIndexActivity({
            type: 'progress',
            source,
            progress: indexProgress,
          })
          onQueryProgressChange?.({
            type: 'indexing',
            indexProgress,
          })
        },
        (result) => {
          summary = result
        },
      ) ?? Promise.resolve(false)
    this.vaultIndexUpdatePromise = updatePromise
    let ok = false
    try {
      await updatePromise
      ok = true
    } finally {
      this.onIndexActivity({
        type: 'finish',
        source,
        summary: { ...summary, ok: ok && summary.saved },
      })
      options.signal?.removeEventListener('abort', forwardAbort)
      if (this.vaultIndexUpdatePromise === updatePromise) {
        this.vaultIndexUpdatePromise = null
      }
      if (this.indexAbortController === controller) {
        this.indexAbortController = null
      }
    }
    if (this.vaultIndexDirtyVersion === dirtyVersionAtStart) {
      this.vaultIndexDirty = false
      this.semanticSearchReady = true
    }
  }

  async processQuery(input: RAGQueryInput): Promise<QueryResult[]> {
    try {
      const { hydratedResults } = await this.processQueryInternal(input)
      const finalResults = await this.expandWithLinkedMarkdownFiles(
        hydratedResults,
        this.settings.ragOptions.limit,
      )

      input.onQueryProgressChange?.({
        type: 'querying-done',
        queryResult: finalResults,
      })
      return finalResults
    } catch (error) {
      if (isRelatedNotesAbort(error, input.signal)) return []
      if (!this.handleOptionalEmbeddingFailure(error)) {
        throw error
      }
      input.onQueryProgressChange?.({
        type: 'querying-done',
        queryResult: [],
      })
      return []
    }
  }

  /**
   * Run retrieval through hydration but stop before legacy linked-file
   * expansion and before the querying-done UI payload. The graph route uses
   * this boundary so it cannot accidentally reintroduce legacy pseudo-hits.
   */
  private async processQueryInternal(input: RAGQueryInput): Promise<{
    hydratedResults: QueryResult[]
    origins: RetrievalOriginMap
  }> {
    const {
      query,
      scope,
      onQueryProgressChange,
      fusionStrategy,
      rrfK,
      signal,
    } = input
    throwIfRelatedNotesAborted(signal)
    if (!this.embeddingModel) {
      if (this.settings.ragOptions.bm25Weight < 1)
        input.onSemanticOutcome?.('not_ready')
      throw new Error('Embedding model is not set')
    }
    // Do one startup staleness check, then rely on vault/settings dirty events.
    // This avoids a full vault mtime scan before every query in large vaults.
    if (this.vaultIndexDirty || !this.hasCheckedVaultIndexOnStartup) {
      this.hasCheckedVaultIndexOnStartup = true
      if (this.isSemanticSearchReady()) {
        // Index freshness is best-effort for retrieval. Do not make a chat
        // turn wait for a vault-wide embedding update or a failed endpoint.
        this.startBackgroundIndexUpdate()
      }
    }
    // Weight of BM25 (lexical) scores in the hybrid search.
    // 0 = embedding only, 1 = BM25 only.
    const configuredBm25Weight = Math.min(
      Math.max(this.settings.ragOptions.bm25Weight, 0),
      1,
    )
    let bm25Weight = configuredBm25Weight
    let queryEmbedding: number[] | null = null
    const semanticReady = this.isSemanticSearchReady()
    if (bm25Weight < 1 && this.isSemanticSearchReady()) {
      try {
        queryEmbedding = signal
          ? await this.getQueryEmbedding(query, signal)
          : await this.getQueryEmbedding(query)
      } catch (error) {
        if (!this.handleOptionalEmbeddingFailure(error)) throw error
        // A hybrid query can still return lexical results immediately after
        // the optional semantic request fails.
        if (isRelatedNotesAbort(error, signal))
          return { hydratedResults: [], origins: new Map() }
        queryEmbedding = null
      }
    }
    onQueryProgressChange?.({
      type: 'querying',
    })

    const limit = this.settings.ragOptions.limit
    const retrievalLimit = limit

    throwIfRelatedNotesAborted(signal)
    let semanticFallbackUsed = false
    let vectorResults: QueryCandidate[] = []
    if (queryEmbedding !== null) {
      try {
        vectorResults =
          (await this.withSemanticQueryDeadline(
            this.vectorManager?.performSimilaritySearchMetadata(
              queryEmbedding,
              this.embeddingModel,
              {
                minSimilarity: this.settings.ragOptions.minSimilarity,
                limit: retrievalLimit,
                scope,
              },
            ) ?? Promise.resolve([]),
            signal,
          )) ?? []
      } catch (error) {
        if (isRelatedNotesAbort(error, signal)) throw error
        if (!(error instanceof SemanticQueryDeadlineError)) throw error
        // A vector query can be delayed by a PGlite checkpoint or a large
        // index scan. Keep the foreground request useful by immediately
        // selecting the lexical path, even when the configured weight was
        // embedding-only. The underlying PGlite promise is allowed to settle
        // on its own because the current repository API has no cancellation
        // signal for a SQL statement.
        semanticFallbackUsed = true
        bm25Weight = 1
      }
    }
    if (configuredBm25Weight < 1) {
      input.onSemanticOutcome?.(
        !semanticReady
          ? 'not_ready'
          : queryEmbedding === null
            ? 'embedding_failed'
            : semanticFallbackUsed
              ? 'deadline'
              : vectorResults.length
                ? 'vector'
                : 'no_vector_hits',
      )
    }
    const bm25Results =
      bm25Weight > 0 || semanticFallbackUsed
        ? signal
          ? await this.performBm25Search(query, retrievalLimit, scope, signal)
          : await this.performBm25Search(query, retrievalLimit, scope)
        : []
    throwIfRelatedNotesAborted(signal)

    const origins: RetrievalOriginMap = new Map()
    recordRetrievalOrigins(origins, vectorResults, 'vector')
    recordRetrievalOrigins(origins, bm25Results, 'bm25')

    let queryResult: QueryCandidate[]
    if (bm25Weight <= 0) {
      queryResult = vectorResults
    } else if (bm25Weight >= 1) {
      queryResult = bm25Results
    } else {
      queryResult = this.fuseResults(
        vectorResults,
        bm25Results,
        bm25Weight,
        retrievalLimit,
        fusionStrategy,
        rrfK,
      )
    }

    const hydratedResults = await this.hydrateQueryCandidates(
      queryResult,
      signal,
    )
    return { hydratedResults, origins }
  }

  /**
   * Bound the wait for the non-cancellable vector SQL request. The deadline
   * protects the foreground query while the original promise is still
   * observed by Promise.race, preventing an unhandled rejection when PGlite
   * eventually reports its result.
   */
  private async withSemanticQueryDeadline<T>(
    request: Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let timeoutId: ReturnType<typeof runtimeTimers.setTimeout> | null = null
    let removeAbortListener: () => void = () => undefined
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = runtimeTimers.setTimeout(() => {
        reject(
          new SemanticQueryDeadlineError(RAGEngine.SEMANTIC_QUERY_TIMEOUT_MS),
        )
      }, RAGEngine.SEMANTIC_QUERY_TIMEOUT_MS)
    })
    const abort = signal
      ? new Promise<never>((_, reject) => {
          const onAbort = () =>
            reject(new Error('Related notes request aborted'))
          if (signal.aborted) {
            onAbort()
            return
          }
          signal.addEventListener('abort', onAbort, { once: true })
          removeAbortListener = () =>
            signal.removeEventListener('abort', onAbort)
        })
      : null
    try {
      return await Promise.race(
        abort ? [request, timeout, abort] : [request, timeout],
      )
    } finally {
      if (timeoutId) runtimeTimers.clearTimeout(timeoutId)
      removeAbortListener()
    }
  }

  private async hydrateQueryCandidates(
    candidates: readonly QueryCandidate[],
    signal?: AbortSignal,
  ): Promise<QueryResult[]> {
    throwIfRelatedNotesAborted(signal)
    const current = await Promise.all(
      candidates.map(async (candidate) => {
        if (isAiPrivatePath(candidate.path)) return null
        const file = this.app?.vault?.getFileByPath?.(candidate.path)
        if (!isDocumentPath(candidate.path))
          // Rows of a note excluded by type can outlive the setting until
          // the next reconcile removes them.
          return file && hasExcludedType(this.app, file, this.settings)
            ? null
            : candidate
        if (!file || !shouldIndexSource(file, this.settings, true, this.app))
          return null
        const source = await new SourceTextReader(this.app).read(candidate.path)
        return source?.document &&
          source.revision === candidate.metadata.revisionHash &&
          extractorKey(source.document) === candidate.metadata.extractorVersion
          ? candidate
          : null
      }),
    )
    candidates = current.filter(
      (candidate): candidate is QueryCandidate => candidate !== null,
    )
    const missingIds = candidates
      .filter((candidate) => candidate.content === undefined)
      .map((candidate) => candidate.id)
    if (missingIds.length === 0) {
      return candidates as QueryResult[]
    }
    if (!this.vectorManager || !this.embeddingModel) {
      return candidates.filter(
        (candidate): candidate is QueryResult =>
          candidate.content !== undefined,
      )
    }

    const hydratedRows = await this.vectorManager.getIndexedChunksByIds(
      [...new Set(missingIds)],
      this.embeddingModel,
    )
    throwIfRelatedNotesAborted(signal)
    const contentById = new Map(
      hydratedRows.map((row) => [row.id, row.content]),
    )
    return candidates.flatMap((candidate) => {
      const content = candidate.content ?? contentById.get(candidate.id)
      return content === undefined ? [] : [{ ...candidate, content }]
    })
  }

  /**
   * New location-aware retrieval surface. The legacy `processQuery` contract
   * remains intact for ContextBuilder and tool consumers while callers that
   * need revision-bound identities can opt into the adapter explicitly.
   */
  async processQueryHits(input: RAGQueryInput): Promise<RetrievalHit[]> {
    try {
      if (input.hitSelection?.expandGraph !== true) {
        return await this.processQueryHitsLegacy(input)
      }
      return await this.processQueryHitsWithGraph(input)
    } catch (error) {
      if (isRelatedNotesAbort(error, input.signal)) return []
      if (!this.handleOptionalEmbeddingFailure(error)) {
        throw error
      }
      return []
    }
  }

  /**
   * Find notes related to an active Markdown note. This is intentionally a
   * separate surface from processQueryHits: the active note is the graph seed
   * here, including when it has no vector index or lexical hit.
   */
  async findRelatedNotes(input: {
    activePath: string
    limit?: number
    signal?: AbortSignal
    allowOneShotEmbedding?: boolean
    activeContent?: string
    baseCandidates?: {
      bm25Candidates: RelatedCandidate[]
      graphCandidates: RelatedCandidate[]
    }
  }): Promise<RelatedNote[]> {
    try {
      throwIfRelatedNotesAborted(input.signal)
      const file = this.app.vault.getFileByPath(input.activePath)
      if (!file) return []
      const activeContent =
        file.extension === 'md'
          ? (input.activeContent ?? (await this.app.vault.cachedRead(file)))
          : (await new SourceTextReader(this.app).read(file.path))?.text
      if (activeContent == null) return []
      throwIfRelatedNotesAborted(input.signal)
      const limit = Math.max(
        0,
        Math.floor(input.limit ?? this.settings.verbex.relatedNotes.limit),
      )
      if (limit === 0) return []

      const [bm25Candidates, graphCandidates] = input.baseCandidates
        ? [
            input.baseCandidates.bm25Candidates,
            input.baseCandidates.graphCandidates,
          ]
        : await Promise.all([
            this.findRelatedLexicalCandidates(
              input.activePath,
              activeContent,
              limit,
              input.signal,
            ),
            this.findRelatedGraphCandidates(
              file,
              activeContent,
              limit,
              input.signal,
            ),
          ])
      throwIfRelatedNotesAborted(input.signal)

      let vectorCandidates: RelatedCandidate[] = []
      if (
        this.embeddingModel &&
        (this.isSemanticSearchReady() || input.allowOneShotEmbedding === true)
      ) {
        try {
          vectorCandidates = await this.findRelatedVectorCandidates(
            file,
            activeContent,
            limit,
            input.allowOneShotEmbedding === true,
            input.signal,
          )
        } catch (error) {
          if (isRelatedNotesAbort(error, input.signal)) throw error
          if (!this.handleOptionalEmbeddingFailure(error)) throw error
          // The pane remains useful when an optional embedding request fails:
          // the lexical and graph candidates computed above are retained.
          vectorCandidates = []
        }
      }

      return groupDocumentResults(
        this.app,
        this.settings,
        groupIntoRelatedNotes(
          vectorCandidates,
          bm25Candidates,
          graphCandidates,
          {
            activePath: input.activePath,
            limit,
            excludePath: dailyNoteExclusion(
              this.app,
              this.settings.verbex.relatedNotes.excludeDailyNotes,
            ),
          },
        ),
      )
    } catch (error) {
      if (isRelatedNotesAbort(error, input.signal)) return []
      if (this.handleOptionalEmbeddingFailure(error)) return []
      throw error
    }
  }

  private async findRelatedLexicalCandidates(
    activePath: string,
    activeContent: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<RelatedCandidate[]> {
    if (!this.lexicalIndex) return []
    throwIfRelatedNotesAborted(signal)
    const results = await this.lexicalIndex.search(
      activeContent,
      Math.max(limit * 4, 20),
      signal,
    )
    throwIfRelatedNotesAborted(signal)
    return results
      .filter((result) => result.path && result.path !== activePath)
      .map((result) => ({
        path: result.path,
        title: result.title,
        snippet: result.snippet,
        source: 'bm25' as const,
        score: result.score,
        ...(result.startLine
          ? { startLine: result.startLine, endLine: result.endLine }
          : {}),
      }))
  }

  private async findRelatedGraphCandidates(
    activeFile: TFile,
    activeContent: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<RelatedCandidate[]> {
    if (activeFile.extension !== 'md') return []
    const markdownFiles = (
      typeof this.app.vault.getMarkdownFiles === 'function'
        ? this.app.vault.getMarkdownFiles()
        : []
    ).filter((file) => !hasExcludedType(this.app, file, this.settings))
    const activeCache = this.app.metadataCache?.getFileCache?.(activeFile)
    const graphRelations = discoverRelatedGraphRelations({
      activePath: activeFile.path,
      activeContent,
      activeTags: activeCache?.tags?.map((tag) => tag.tag) ?? [],
      activeFolderPath:
        activeFile.parent?.path ?? parentFolderPath(activeFile.path),
      resolvedLinks: this.app.metadataCache?.resolvedLinks ?? {},
      candidates: markdownFiles.map((file) => {
        const cache = this.app.metadataCache?.getFileCache?.(file)
        return {
          path: file.path,
          folderPath: file.parent?.path ?? parentFolderPath(file.path),
          tags: cache?.tags?.map((tag) => tag.tag) ?? [],
        }
      }),
      frontmatterReferences: Object.entries(
        activeCache?.frontmatter ?? {},
      ).flatMap(([field, value]) =>
        frontmatterReferenceValues(value, field).flatMap((targetRef) => {
          const target = resolveLinkedMarkdownFile({
            app: this.app,
            sourcePath: activeFile.path,
            linkTarget: targetRef,
          })
          return target ? [{ targetPath: target.path, field }] : []
        }),
      ),
      limit,
      signal,
    })
    return await materializeRelatedGraphCandidates(
      graphRelations,
      activeFile.path,
      {
        resolveLinkedFile: (sourcePath, targetRef) => {
          const file = resolveLinkedMarkdownFile({
            app: this.app,
            sourcePath,
            linkTarget: targetRef,
          })
          return file ? { path: file.path } : null
        },
        readFile: async (path) => {
          const file = this.app.vault.getFileByPath(path)
          if (!file) return null
          return (
            (await new SourceTextReader(this.app).read(file.path))?.text ?? null
          )
        },
        titleForPath: (path) =>
          this.app.vault.getFileByPath(path)?.basename ?? path,
        signal,
      },
    )
  }

  private async findRelatedVectorCandidates(
    activeFile: {
      path: string
      extension: string
      stat: { mtime: number }
    },
    activeContent: string,
    limit: number,
    allowOneShotEmbedding: boolean,
    signal?: AbortSignal,
  ): Promise<RelatedCandidate[]> {
    if (!this.vectorManager || !this.embeddingModel) return []
    const source = isDocumentPath(activeFile.path)
      ? await new SourceTextReader(this.app).read(activeFile.path)
      : null
    if (
      isDocumentPath(activeFile.path) &&
      (!source?.document ||
        !shouldIndexSource(activeFile, this.settings, true, this.app))
    )
      return []
    throwIfRelatedNotesAborted(signal)
    const storedRows = await this.vectorManager.getVectorsByFilePath(
      activeFile.path,
      this.embeddingModel,
    )
    throwIfRelatedNotesAborted(signal)
    const currentRows = storedRows.filter(
      (row) =>
        row.mtime === activeFile.stat.mtime &&
        row.model === this.embeddingModel?.id &&
        row.dimension === this.embeddingModel?.dimension &&
        (!source?.document ||
          (row.metadata.revisionHash === source.revision &&
            row.metadata.extractorVersion === extractorKey(source.document))) &&
        Array.isArray(row.embedding) &&
        row.embedding.length === this.embeddingModel?.dimension,
    )
    const representativeRows = selectEvenlyDistributed(
      currentRows,
      RELATED_VECTOR_QUERY_LIMIT,
      (row) => row.metadata.startLine,
      (row) => row.id,
    )
    const queryVectors = representativeRows.flatMap((row) =>
      row.embedding ? [row.embedding] : [],
    )
    if (queryVectors.length === 0 && allowOneShotEmbedding) {
      queryVectors.push(
        await this.getQueryEmbedding(activeContent.slice(0, 12000), signal),
      )
    }
    if (queryVectors.length === 0) return []

    const bestById = new Map<
      number,
      {
        id: number
        path: string
        mtime: number
        metadata: SelectEmbedding['metadata']
        similarity: number
      }
    >()
    for (const queryVector of queryVectors) {
      throwIfRelatedNotesAborted(signal)
      const rows = await this.vectorManager.performSimilaritySearchMetadata(
        queryVector,
        this.embeddingModel,
        {
          minSimilarity: this.settings.ragOptions.minSimilarity,
          limit: Math.max(limit * 4, 20),
        },
      )
      throwIfRelatedNotesAborted(signal)
      for (const row of rows) {
        if (row.path === activeFile.path) continue
        const file = this.app.vault.getFileByPath(row.path)
        if (
          !file ||
          !shouldIndexSource(file, this.settings, true, this.app) ||
          file.stat.mtime !== row.mtime ||
          row.model !== this.embeddingModel.id ||
          row.dimension !== this.embeddingModel.dimension
        ) {
          continue
        }
        if (isDocumentPath(row.path)) {
          const source = await new SourceTextReader(this.app).read(row.path)
          if (
            !source?.document ||
            source.revision !== row.metadata.revisionHash ||
            extractorKey(source.document) !== row.metadata.extractorVersion
          )
            continue
        }
        const previous = bestById.get(row.id)
        if (!previous || row.similarity > previous.similarity) {
          bestById.set(row.id, row)
        }
      }
    }
    if (bestById.size === 0) return []

    const hydrated = await this.vectorManager.getIndexedChunksByIds(
      [...bestById.keys()],
      this.embeddingModel,
    )
    throwIfRelatedNotesAborted(signal)
    const hydratedById = new Map(hydrated.map((row) => [row.id, row]))
    return [...bestById.values()].flatMap((row) => {
      const target = this.app.vault.getFileByPath(row.path)
      const content = hydratedById.get(row.id)?.content
      if (!target || content === undefined) return []
      return [
        {
          path: row.path,
          title: target.basename,
          snippet: compactRelatedSnippet(content),
          source: 'vector' as const,
          score: row.similarity,
          startLine: row.metadata.startLine,
          endLine: row.metadata.endLine,
        },
      ]
    })
  }

  private async processQueryHitsLegacy(
    input: RAGQueryInput,
  ): Promise<RetrievalHit[]> {
    let results: QueryResult[]
    let hits: RetrievalHit[]
    if (input.withProvenance === true) {
      const { hydratedResults, origins } =
        await this.processQueryInternal(input)
      results = await this.expandWithLinkedMarkdownFiles(
        hydratedResults,
        this.settings.ragOptions.limit,
      )
      input.onQueryProgressChange?.({
        type: 'querying-done',
        queryResult: results,
      })
      hits = await Promise.all(
        results.map((result) =>
          queryResultToRetrievalHit(result, {
            provenance: [...(origins.get(result.id) ?? [])],
          }),
        ),
      )
    } else {
      results = await this.processQuery(input)
      hits = await queryResultsToRetrievalHits(results)
    }
    const selected = selectDiverseRetrievalHits(hits, {
      ...input.hitSelection,
      limit: input.hitSelection?.limit ?? results.length,
    })
    const hydrated = await hydrateRetrievalHits(selected, async (path) => {
      const file = this.app?.vault?.getFileByPath(path)
      return file
        ? ((await new SourceTextReader(this.app).read(file.path))?.text ?? null)
        : null
    })
    if (input.hitSelection?.expandAdjacent === false) {
      return hydrated
    }

    const adjacentCandidates =
      await this.getAdjacentRetrievalCandidates(hydrated)
    return expandConditionalAdjacentRetrievalHits(
      hydrated,
      adjacentCandidates,
      {
        maxPerHit: input.hitSelection?.maxAdjacentPerHit,
      },
    )
  }

  private async processQueryHitsWithGraph(
    input: RAGQueryInput,
  ): Promise<RetrievalHit[]> {
    throwIfRelatedNotesAborted(input.signal)
    const { hydratedResults, origins } = await this.processQueryInternal(input)
    throwIfRelatedNotesAborted(input.signal)
    const directHits = await Promise.all(
      hydratedResults.map((result) =>
        queryResultToRetrievalHit(result, {
          provenance: [...(origins.get(result.id) ?? [])],
        }),
      ),
    )
    const requestedLimit = Math.max(
      0,
      Math.floor(input.hitSelection?.limit ?? directHits.length),
    )
    if (requestedLimit === 0 || directHits.length === 0) return []

    input.onQueryProgressChange?.({ type: 'graph-expanding' })

    const resolvedLinks = this.app.metadataCache?.resolvedLinks ?? {}
    const discoveredRelations: DiscoveredGraphRelation[] = []
    const expandAdjacent = input.hitSelection?.expandAdjacent !== false
    const maxGraphCandidatesPerSeed = 8
    const maxGraphCandidatesTotal = requestedLimit * maxGraphCandidatesPerSeed

    const markdownFiles = (
      typeof this.app.vault.getMarkdownFiles === 'function'
        ? this.app.vault.getMarkdownFiles()
        : []
    ).filter((file) => !hasExcludedType(this.app, file, this.settings))
    const graphMetadata = markdownFiles.map((file) => {
      const cache = this.app.metadataCache?.getFileCache?.(file)
      return {
        path: file.path,
        folderPath: file.parent?.path ?? parentFolderPath(file.path),
        tags: cache?.tags?.map((tag) => tag.tag) ?? [],
      }
    })

    let cachedChunks: ChunkLocator[] | null = null
    if (expandAdjacent) {
      const indexedChunks = await this.ensureIndexedChunksCache(
        directHits.map((hit) => hit.locator.path),
      )
      cachedChunks = await Promise.all(
        indexedChunks.map((chunk) =>
          queryResultToChunkLocator({ ...chunk, similarity: 0 }),
        ),
      )
    }

    for (const seed of directHits) {
      throwIfRelatedNotesAborted(input.signal)
      const seedScore = directHitScore(seed)
      const seedRelations: DiscoveredGraphRelation[] = []
      if (seed.content !== undefined && !isDocumentPath(seed.locator.path)) {
        seedRelations.push(
          ...discoverWikilinkOut(
            seed.content,
            seed.locator.path,
            seed.locator.unitId,
            seedScore,
          ),
        )
      }
      seedRelations.push(
        ...discoverBacklinkIn(
          resolvedLinks,
          seed.locator.path,
          seed.locator.unitId,
          seedScore,
          input.scope,
        ),
      )
      if (cachedChunks) {
        seedRelations.push(
          ...discoverAdjacentChunks(
            cachedChunks.filter((chunk) => chunk.path === seed.locator.path),
            seed.locator,
            seed.locator.unitId,
            seedScore,
          ),
        )
      }
      const seedFile = this.app.vault.getFileByPath(seed.locator.path)
      const seedCache = seedFile
        ? this.app.metadataCache?.getFileCache?.(seedFile)
        : null
      if (seedCache?.tags && graphMetadata.length > 0) {
        seedRelations.push(
          ...discoverSharedTagRelations(
            seed.locator.path,
            seedCache.tags.map((tag) => tag.tag),
            graphMetadata,
            seed.locator.unitId,
            seedScore,
            input.scope,
          ),
        )
      }
      if (seedFile && graphMetadata.length > 0) {
        const frontmatterReferences = Object.entries(
          seedCache?.frontmatter ?? {},
        ).flatMap(([field, value]) =>
          frontmatterReferenceValues(value, field).flatMap((targetRef) => {
            const target = resolveLinkedMarkdownFile({
              app: this.app,
              sourcePath: seed.locator.path,
              linkTarget: targetRef,
            })
            return target ? [{ targetPath: target.path, field }] : []
          }),
        )
        seedRelations.push(
          ...discoverFrontmatterReferences(
            seed.locator.path,
            frontmatterReferences,
            seed.locator.unitId,
            seedScore,
            input.scope,
          ),
        )
        seedRelations.push(
          ...discoverFolderAdjacentRelations(
            seed.locator.path,
            seedFile.parent?.path ?? parentFolderPath(seed.locator.path),
            graphMetadata,
            seed.locator.unitId,
            seedScore,
            input.scope,
          ),
        )
      }
      // Bound discovery before any file reads or BM25 calls. The v1 route is
      // intentionally one-hop and finite even when a note contains many links.
      if (discoveredRelations.length >= maxGraphCandidatesTotal) break
      discoveredRelations.push(
        ...seedRelations.slice(
          0,
          Math.min(
            maxGraphCandidatesPerSeed,
            maxGraphCandidatesTotal - discoveredRelations.length,
          ),
        ),
      )
    }

    const materializeDeps: MaterializeGraphRelationsDeps = {
      resolveLinkedFile: (sourcePath, targetRef) => {
        const file = resolveLinkedMarkdownFile({
          app: this.app,
          sourcePath,
          linkTarget: targetRef,
        })
        return file ? { path: file.path } : null
      },
      readFile: async (path) => {
        const file = this.app.vault.getFileByPath(path)
        if (!file || file.extension !== 'md' || isAiPrivatePath(path))
          return null
        try {
          return await this.app.vault.cachedRead(file)
        } catch (error) {
          console.warn(`Failed to read graph target ${path}`, error)
          return null
        }
      },
      scopedBm25Search: async (query, path) => {
        const results = input.signal
          ? await this.performBm25Search(
              query,
              1,
              { files: [path], folders: [] },
              input.signal,
            )
          : await this.performBm25Search(query, 1, {
              files: [path],
              folders: [],
            })
        const result = results[0]
        return result ? await queryResultToChunkLocator(result) : null
      },
      chunkSize: this.settings.ragOptions.chunkSize,
      scope: input.scope,
    }

    const graphWeights = {
      wikilink_out: 0.6,
      backlink_in: 0.5,
      adjacent: 0.4,
      frontmatter_ref: 0.55,
      shared_tag: 0.3,
      folder_adjacent: 0.2,
    } as const
    throwIfRelatedNotesAborted(input.signal)
    const materialized = await Promise.allSettled(
      discoveredRelations.map((relation) =>
        materializeGraphRelation(
          relation,
          relation.seedPath,
          input.query,
          materializeDeps,
          graphWeights,
        ),
      ),
    )
    throwIfRelatedNotesAborted(input.signal)
    const graphHits: RetrievalHit[] = []
    for (const result of materialized) {
      if (result.status === 'fulfilled' && result.value) {
        graphHits.push(result.value)
      } else if (result.status === 'rejected') {
        console.warn(
          'Failed to materialize graph retrieval candidate',
          result.reason,
        )
      }
    }
    graphHits.sort(
      (left, right) =>
        (right.scores.graph ?? 0) - (left.scores.graph ?? 0) ||
        graphRelationPriority(left) - graphRelationPriority(right) ||
        left.locator.path.localeCompare(right.locator.path) ||
        left.locator.startLine - right.locator.startLine,
    )

    const selected = selectDirectThenGraphHits(directHits, graphHits, {
      ...input.hitSelection,
      limit: requestedLimit,
    })
    return hydrateRetrievalHits(selected, async (path) => {
      const file = this.app.vault.getFileByPath(path)
      return file
        ? ((await new SourceTextReader(this.app).read(file.path))?.text ?? null)
        : null
    })
  }

  private async expandWithLinkedMarkdownFiles(
    queryResult: QueryResult[],
    limit: number,
  ): Promise<QueryResult[]> {
    const finalLimit = Math.max(Math.floor(limit), 0)
    const baseResults = queryResult.slice(0, finalLimit)
    const linkedFileLimit = Math.max(
      Math.floor(this.settings.ragOptions.linkedMarkdownFileLimit),
      0,
    )
    const maxDepth = Math.max(
      Math.floor(this.settings.ragOptions.linkedMarkdownDepth),
      0,
    )
    const remainingLinkedSlots = Math.max(finalLimit - baseResults.length, 0)
    const expansionLimit = Math.min(linkedFileLimit, remainingLinkedSlots)
    if (expansionLimit === 0 || maxDepth === 0 || baseResults.length === 0) {
      return baseResults
    }

    const existingPaths = new Set(baseResults.map((result) => result.path))
    const visitedPaths = new Set(existingPaths)
    const queue = baseResults.map((result) => ({
      path: result.path,
      depth: 0,
    }))
    const linkedResults: QueryResult[] = []

    while (queue.length > 0 && linkedResults.length < expansionLimit) {
      const current = queue.shift()
      if (!current || current.depth >= maxDepth) {
        continue
      }

      const sourceFile = this.app.vault.getFileByPath(current.path)
      if (!sourceFile || sourceFile.extension !== 'md') {
        continue
      }

      let sourceContent: string
      try {
        sourceContent = await this.app.vault.cachedRead(sourceFile)
      } catch (error) {
        console.warn(`Failed to read linked source file ${current.path}`, error)
        continue
      }

      for (const reference of extractMarkdownLinkReferences(sourceContent)) {
        if (linkedResults.length >= expansionLimit) {
          break
        }

        const linkedFile = resolveLinkedMarkdownFile({
          app: this.app,
          sourcePath: current.path,
          linkTarget: reference.target,
        })
        if (
          !linkedFile ||
          visitedPaths.has(linkedFile.path) ||
          isAiPrivatePath(linkedFile.path) ||
          hasExcludedType(this.app, linkedFile, this.settings)
        ) {
          continue
        }

        visitedPaths.add(linkedFile.path)
        let linkedContent: string
        try {
          linkedContent = await this.app.vault.cachedRead(linkedFile)
        } catch (error) {
          console.warn(
            `Failed to read linked markdown file ${linkedFile.path}`,
            error,
          )
          continue
        }

        linkedResults.push(
          this.createLinkedMarkdownQueryResult(
            linkedFile,
            linkedContent,
            reference.anchor,
          ),
        )
        queue.push({
          path: linkedFile.path,
          depth: current.depth + 1,
        })
      }
    }

    if (linkedResults.length === 0) {
      return baseResults
    }

    return [
      ...baseResults,
      ...linkedResults.filter((result) => !existingPaths.has(result.path)),
    ].slice(0, finalLimit)
  }

  private createLinkedMarkdownQueryResult(
    file: {
      path: string
      stat: {
        mtime: number
      }
    },
    content: string,
    anchor?: string,
  ): QueryResult {
    const range = resolveAnchorLineRange(content, anchor)
    return {
      id: -Math.abs(this.hashPath(file.path)),
      path: file.path,
      mtime: file.stat.mtime,
      content: sliceInclusiveLines(content, range.startLine, range.endLine),
      model:
        this.embeddingModel?.id ?? getActiveEmbeddingModelId(this.settings),
      dimension: this.embeddingModel?.dimension ?? 0,
      metadata: {
        startLine: range.startLine,
        endLine: range.endLine,
      },
      similarity: 0,
    }
  }

  private async ensureIndexedChunksCache(
    paths: readonly string[],
  ): Promise<Omit<SelectEmbedding, 'embedding'>[]> {
    if (!this.vectorManager || !this.embeddingModel || paths.length === 0)
      return []
    const generation = this.indexCacheGeneration
    const manager = this.vectorManager
    const model = this.embeddingModel
    const uniquePaths = [...new Set(paths)]
    const existing =
      this.indexedChunksCache?.modelId === model.id
        ? this.indexedChunksCache.byPath
        : new Map<string, Omit<SelectEmbedding, 'embedding'>[]>()
    const missing = uniquePaths.filter((path) => !existing.has(path))
    const chunks =
      missing.length > 0
        ? await manager.getIndexedChunksByPaths(missing, model)
        : []
    const loaded = new Map<string, Omit<SelectEmbedding, 'embedding'>[]>(
      missing.map((path) => [path, []]),
    )
    for (const chunk of chunks) loaded.get(chunk.path)?.push(chunk)
    if (
      generation === this.indexCacheGeneration &&
      manager === this.vectorManager &&
      model === this.embeddingModel
    ) {
      const current =
        this.indexedChunksCache?.modelId === model.id
          ? this.indexedChunksCache.byPath
          : new Map<string, Omit<SelectEmbedding, 'embedding'>[]>()
      for (const [path, rows] of loaded) current.set(path, rows)
      this.indexedChunksCache = { modelId: model.id, byPath: current }
    }
    return uniquePaths
      .flatMap((path) => existing.get(path) ?? loaded.get(path) ?? [])
      .sort((a, b) => a.id - b.id)
  }

  private async getAdjacentRetrievalCandidates(
    selected: readonly RetrievalHit[],
  ): Promise<RetrievalHit[]> {
    if (selected.length === 0 || !this.vectorManager || !this.embeddingModel) {
      return []
    }
    const paths = new Set(selected.map((hit) => hit.locator.path))
    const chunks = await this.ensureIndexedChunksCache([...paths])
    const candidateRows = chunks
      .filter((chunk) => paths.has(chunk.path))
      .map((chunk) => ({ ...chunk, similarity: 0 }))
    return queryResultsToRetrievalHits(candidateRows, {
      provenance: ['adjacent'],
    })
  }

  private hashPath(path: string): number {
    let hash = 0
    for (let i = 0; i < path.length; i += 1) {
      hash = (hash * 31 + path.charCodeAt(i)) | 0
    }
    return hash === 0 ? 1 : hash
  }

  private async getBm25Index(): Promise<{
    chunks: IndexedChunkCandidate[]
    index: Bm25Index
  }> {
    if (!this.embeddingModel) {
      throw new Error('Embedding model is not set')
    }
    if (
      this.bm25IndexCache &&
      this.bm25IndexCache.modelId === this.embeddingModel.id
    ) {
      return this.bm25IndexCache
    }
    const generation = this.indexCacheGeneration
    const manager = this.vectorManager
    const model = this.embeddingModel
    const chunks = (await manager?.getAllIndexedChunkMetadata(model)) ?? []
    const legacyChunks = chunks.filter(
      (chunk) =>
        !chunk.metadata.termFreq ||
        !Number.isInteger(chunk.metadata.termLength),
    )
    let legacyContentById = new Map<number, string>()
    if (legacyChunks.length > 0 && manager && manager === this.vectorManager) {
      const hydratedLegacyChunks = await manager.getIndexedChunksByIds(
        legacyChunks.map((chunk) => chunk.id),
        model,
      )
      legacyContentById = new Map(
        hydratedLegacyChunks.map((chunk) => [chunk.id, chunk.content]),
      )
    }
    const index = Bm25Index.fromTermFreqs(
      chunks.map((chunk) => {
        const termLength = chunk.metadata.termLength
        if (
          chunk.metadata.termFreq &&
          typeof termLength === 'number' &&
          Number.isInteger(termLength)
        ) {
          return {
            termFreq: chunk.metadata.termFreq,
            length: termLength,
          }
        }
        const content = chunk.content ?? legacyContentById.get(chunk.id)
        return content === undefined
          ? { termFreq: {}, length: 0 }
          : computeTermFreq(content)
      }),
    )
    const result = { modelId: model.id, chunks, index }
    if (
      generation === this.indexCacheGeneration &&
      manager === this.vectorManager &&
      model === this.embeddingModel
    ) {
      this.bm25IndexCache = result
    }
    return result
  }

  private async performBm25Search(
    query: string,
    limit: number,
    scope?: {
      files: string[]
      folders: string[]
    },
    signal?: AbortSignal,
  ): Promise<QueryResult[]> {
    throwIfRelatedNotesAborted(signal)
    const { chunks, index } = await this.getBm25Index()
    throwIfRelatedNotesAborted(signal)
    const searchResults = index.search(query)
    if (searchResults.length === 0) {
      return []
    }
    const scopedSearchResults = searchResults.filter(
      ({ index: chunkIndex }) => {
        const chunk = chunks[chunkIndex]
        return chunk !== undefined && this.matchesScope(chunk.path, scope)
      },
    )
    if (scopedSearchResults.length === 0) {
      return []
    }
    // Normalize raw BM25 scores to [0, 1] so they are comparable with
    // cosine similarity when fusing the two result sets
    const maxScore = scopedSearchResults[0].score
    const candidates: QueryCandidate[] = scopedSearchResults
      .slice(0, Math.max(limit, 0))
      .flatMap(({ index: chunkIndex, score }) => {
        const chunk = chunks[chunkIndex]
        return chunk
          ? [
              {
                ...chunk,
                similarity: maxScore > 0 ? score / maxScore : 0,
              },
            ]
          : []
      })
    return await this.hydrateQueryCandidates(candidates, signal)
  }

  private matchesScope(
    path: string,
    scope?: {
      files: string[]
      folders: string[]
    },
  ): boolean {
    if (!scope || (scope.files.length === 0 && scope.folders.length === 0)) {
      return true
    }
    if (scope.files.includes(path)) {
      return true
    }
    return scope.folders.some((folder) => path.startsWith(`${folder}/`))
  }

  /**
   * Merges vector and BM25 results with weighted score fusion:
   * combined = (1 - bm25Weight) * vectorScore + bm25Weight * bm25Score.
   * Both score sets are max-normalized to [0, 1] before mixing; BM25 scores
   * arrive already normalized, so without normalizing the cosine
   * similarities as well (typically well below 1.0) the BM25 component
   * would systematically dominate the weighted sum.
   * A chunk missing from one result set contributes 0 for that component.
   */
  private fuseResults(
    vectorResults: QueryCandidate[],
    bm25Results: QueryCandidate[],
    bm25Weight: number,
    limit: number,
    strategy: RetrievalFusionStrategy = 'weighted_sum',
    rrfK?: number,
  ): QueryCandidate[] {
    const resultsById = new Map<string, QueryCandidate>()
    for (const result of [...vectorResults, ...bm25Results]) {
      const id = String(result.id)
      if (!resultsById.has(id)) resultsById.set(id, result)
    }
    const fused = fuseRankedScores(
      vectorResults.map((result) => ({
        id: String(result.id),
        score: result.similarity,
      })),
      bm25Results.map((result) => ({
        id: String(result.id),
        score: result.similarity,
      })),
      { strategy, bm25Weight, limit, rrfK },
    )
    return fused.flatMap(({ id, score }) => {
      const result = resultsById.get(id)
      return result ? [{ ...result, similarity: score }] : []
    })
  }

  private async getQueryEmbedding(
    query: string,
    signal?: AbortSignal,
  ): Promise<number[]> {
    if (!this.embeddingModel) {
      throw new Error('Embedding model is not set')
    }
    throwIfRelatedNotesAborted(signal)
    const cacheKey = `${this.embeddingModel.id}:${query}`
    const cached = this.queryEmbeddingCache.get(cacheKey)
    if (cached) {
      // Re-insert to refresh recency, since eviction removes the oldest
      // insertion (LRU rather than FIFO)
      this.queryEmbeddingCache.delete(cacheKey)
      this.queryEmbeddingCache.set(cacheKey, cached)
      return cached
    }
    const controller = new AbortController()
    let timeoutId: ReturnType<typeof runtimeTimers.setTimeout> | null = null
    const forwardAbort = () => controller.abort()
    signal?.addEventListener('abort', forwardAbort, { once: true })
    try {
      if (signal?.aborted) controller.abort()
      const embeddingRequest = this.embeddingModel.getEmbedding(query, {
        signal: controller.signal,
      })
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = runtimeTimers.setTimeout(() => {
          // Reject first so fetch implementations that synchronously reject
          // on abort cannot replace the user-facing timeout classification.
          reject(new RequestTimeoutError(RAGEngine.SEMANTIC_QUERY_TIMEOUT_MS))
          controller.abort()
        }, RAGEngine.SEMANTIC_QUERY_TIMEOUT_MS)
      })
      const embedding = await Promise.race([embeddingRequest, timeout])
      throwIfRelatedNotesAborted(signal)
      this.queryEmbeddingCache.set(cacheKey, embedding)
      while (
        this.queryEmbeddingCache.size > RAGEngine.QUERY_EMBEDDING_CACHE_SIZE
      ) {
        const oldestKey = this.queryEmbeddingCache.keys().next().value as
          | string
          | undefined
        if (oldestKey === undefined) {
          break
        }
        this.queryEmbeddingCache.delete(oldestKey)
      }
      return embedding
    } finally {
      if (timeoutId) runtimeTimers.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }

  private startBackgroundIndexUpdate(): void {
    if (
      this.settings.verbex.search.mode === 'bm25' ||
      this.vaultIndexUpdatePromise ||
      !this.embeddingModel ||
      this.semanticFailureUntil === Infinity
    )
      return

    void this.updateVaultIndex({
      reindexAll: false,
      source: 'automatic',
    }).catch((error) => {
      if (this.handleOptionalEmbeddingFailure(error)) return
      console.warn('Background embedding index update failed', error)
    })
  }

  private handleOptionalEmbeddingFailure(error: unknown): boolean {
    const kind = classifyEmbeddingError(error)
    if (embeddingErrorUi(kind) !== 'notice') return false

    if (kind === 'runtime_missing') {
      this.semanticFailureUntil = Infinity
      this.onEmbeddingRuntimeMissing()
      return true
    }

    this.semanticFailureUntil =
      Date.now() + RAGEngine.SEMANTIC_FAILURE_COOLDOWN_MS
    const now = Date.now()
    if (
      now - (this.lastSemanticFailureNoticeAt ?? 0) >=
      EMBEDDING_FAILURE_NOTICE_DURATION_MS
    ) {
      this.lastSemanticFailureNoticeAt = now
      showEmbeddingErrorNotice(kind, error)
    }
    return true
  }
}
