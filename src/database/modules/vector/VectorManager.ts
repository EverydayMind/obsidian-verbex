import { PgliteDatabase } from 'drizzle-orm/pglite'
import { backOff } from 'exponential-backoff'
import { minimatch } from 'minimatch'
import { App, MarkdownView, Notice, TFile } from 'obsidian'

import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
  LLMBaseUrlNotSetException,
  LLMRateLimitExceededException,
} from '../../../core/llm/exception'
import { computeTermFreq } from '../../../core/rag/bm25'
import { documentQueue } from '../../../core/rag/documentSources/extractionQueue'
import {
  isDocumentPath,
  isGeneratedSidecar,
  listIndexableSources,
  shouldIndexSource,
} from '../../../core/rag/documentSources/indexableSources'
import { extractorKey } from '../../../core/rag/documentSources/projection'
import { documentEmbeddingChunks } from '../../../core/rag/documentSources/sourceEmbedding'
import type { EmbeddingIndexMutation } from '../../../core/rag/embeddingIndexQueue'
import { LocalEmbeddingRuntimeMissingError } from '../../../core/rag/localE5Runtime'
import { SourceTextReader } from '../../../core/rag/sourceTextReader'
import { DatabaseSaveException } from '../../../database/exception'
import {
  InsertEmbedding,
  SelectEmbedding,
  VectorMetaData,
} from '../../../database/schema'
import { t } from '../../../i18n'
import { runtimeTimers } from '../../../platform/runtime'
import {
  EmbeddingDbStats,
  EmbeddingModelClient,
} from '../../../types/embedding'
import { IndexProgress } from '../../../types/queryProgress'
import { coerceString } from '../../../utils/coerceString'
import { chunkArray } from '../../../utils/common/chunk-array'
import { RequestTimeoutError } from '../../../utils/llm/httpTransport'
import { StartupDiagnostics } from '../../../utils/startupDiagnostics'
import { DatabaseErrorReporter, logDatabaseError } from '../../errorReporter'

import {
  EmbeddingIndexSummary,
  EmbeddingSearchMetadata,
  EmbeddingSearchScope,
  IndexedChunkMetadata,
  VectorRepository,
} from './VectorRepository'

const FILE_READ_CONCURRENCY = 8
const COOPERATIVE_YIELD_EVERY = 8

/** Maximum time without completed embedding progress during a full rebuild. */
export const DEFAULT_EMBEDDING_REBUILD_TIMEOUT_MS = 30 * 60 * 1000

export class EmbeddingIndexAbortError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AbortError'
  }
}

export function isEmbeddingIndexAbortError(error: unknown): boolean {
  return (
    error instanceof EmbeddingIndexAbortError ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function throwIfIndexAborted(
  signal: AbortSignal | undefined,
  timedOut = false,
) {
  if (!signal?.aborted) return
  throw new EmbeddingIndexAbortError(
    timedOut
      ? 'Embedding index rebuild timed out'
      : 'Embedding index rebuild cancelled',
  )
}

function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
  isTimedOut: () => boolean,
): Promise<T> {
  if (!signal) return operation
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(
        new EmbeddingIndexAbortError(
          isTimedOut()
            ? 'Embedding index rebuild timed out'
            : 'Embedding index rebuild cancelled',
        ),
      )
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: Error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

export function createIndexAbortContext(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
) {
  const controller = new AbortController()
  let timedOut = false
  let timeoutId: ReturnType<typeof runtimeTimers.setTimeout> | null = null

  const abort = () => {
    if (timeoutId) runtimeTimers.clearTimeout(timeoutId)
    controller.abort()
  }
  if (signal?.aborted) {
    controller.abort()
  } else {
    signal?.addEventListener('abort', abort, { once: true })
  }

  const markProgress = () => {
    if (controller.signal.aborted || timeoutMs === undefined || timeoutMs <= 0)
      return
    if (timeoutId) runtimeTimers.clearTimeout(timeoutId)
    timeoutId = runtimeTimers.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }
  markProgress()

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut
    },
    markProgress,
    dispose: () => {
      if (timeoutId) runtimeTimers.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', abort)
    },
  }
}

export type EmbeddingErrorKind =
  | 'runtime_missing'
  | 'configuration'
  | 'authentication'
  | 'connectivity'
  | 'timeout'
  | 'rate_limit'
  | 'response_protocol'

export type EmbeddingErrorUi = 'notice' | 'error_modal'

export function embeddingErrorUi(kind: EmbeddingErrorKind): EmbeddingErrorUi {
  if (
    kind === 'runtime_missing' ||
    kind === 'configuration' ||
    kind === 'authentication' ||
    kind === 'connectivity' ||
    kind === 'timeout'
  ) {
    return 'notice'
  }
  return 'error_modal'
}

export const EMBEDDING_FAILURE_NOTICE_DURATION_MS = 5_000

export function embeddingErrorNoticeMessage(kind: EmbeddingErrorKind): string {
  return kind === 'configuration'
    ? 'Embedding model is not configured. Check the provider credentials and base URL.'
    : kind === 'authentication'
      ? 'Embedding authentication failed. Check the provider credentials.'
      : kind === 'timeout'
        ? 'Embedding server request timed out. Check that the server is running.'
        : 'Cannot connect to the embedding server. Check that the server is running.'
}

export function showEmbeddingErrorNotice(
  kind: EmbeddingErrorKind,
  error: unknown,
): void {
  if (kind === 'runtime_missing') return
  new Notice(
    `${embeddingErrorNoticeMessage(kind)}\n${error instanceof Error ? error.message : coerceString(error)}`,
    EMBEDDING_FAILURE_NOTICE_DURATION_MS,
  )
  console.error(`[Verbex] Embedding ${kind} failure`, error)
}

export function classifyEmbeddingError(error: unknown): EmbeddingErrorKind {
  if (error instanceof LocalEmbeddingRuntimeMissingError)
    return 'runtime_missing'
  if (
    error instanceof LLMAPIKeyNotSetException ||
    error instanceof LLMBaseUrlNotSetException
  ) {
    return 'configuration'
  }
  if (error instanceof LLMAPIKeyInvalidException) return 'authentication'
  if (
    error instanceof LLMRateLimitExceededException ||
    errorStatus(error) === 429
  ) {
    return 'rate_limit'
  }
  if (
    error instanceof RequestTimeoutError ||
    errorName(error) === 'TimeoutError' ||
    /timed?\s*out|timeout/i.test(errorMessage(error))
  ) {
    return 'timeout'
  }
  if (
    ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(
      errorCode(error),
    ) ||
    /fetch failed|failed to fetch|network error|network request failed|connection refused|dns/i.test(
      errorMessage(error),
    )
  ) {
    return 'connectivity'
  }
  if ([401, 403].includes(errorStatus(error) ?? -1)) return 'authentication'
  return 'response_protocol'
}

function errorRecord(error: unknown): Record<string, unknown> {
  return typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)
    : {}
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : coerceString(error ?? '')
}

function errorName(error: unknown): string {
  return error instanceof Error
    ? error.name
    : coerceString(errorRecord(error).name ?? '')
}

function errorCode(error: unknown): string {
  const record = errorRecord(error)
  const cause = errorRecord(record.cause)
  return coerceString(record.code ?? cause.code ?? '')
}

function errorStatus(error: unknown): number | undefined {
  const value = errorRecord(error).status
  return typeof value === 'number' ? value : undefined
}

export class VectorManager {
  private app: App
  private repository: VectorRepository
  private readonly startupDiagnostics: StartupDiagnostics | null
  private saveCallback: (() => Promise<void>) | null = null
  private vacuumCallback: (() => Promise<void>) | null = null
  // Notified whenever the embedding table is mutated (indexing, deletion,
  // clearing), so derived caches such as the BM25 index can be invalidated
  // regardless of which code path triggered the mutation
  private indexMutationListeners: (() => void)[] = []

  private async requestSave() {
    try {
      if (this.saveCallback) {
        await this.saveCallback()
        return true
      } else {
        throw new Error('No save callback set')
      }
    } catch (error) {
      if (error instanceof DatabaseSaveException) {
        return false
      }
      this.reportError(
        t('ui.main.vectorSaveTitle'),
        t('ui.main.vectorSaveMessage'),
        error instanceof Error ? error.message : 'Unknown error',
      )
      return false
    }
  }

  private async requestVacuum() {
    if (this.vacuumCallback) {
      await this.vacuumCallback()
    }
  }

  constructor(
    app: App,
    db: PgliteDatabase,
    startupDiagnostics?: StartupDiagnostics,
    private readonly reportError: DatabaseErrorReporter = logDatabaseError,
  ) {
    this.app = app
    this.repository = new VectorRepository(app, db)
    this.startupDiagnostics = startupDiagnostics ?? null
  }

  setSaveCallback(callback: () => Promise<void>) {
    this.saveCallback = callback
  }

  setVacuumCallback(callback: () => Promise<void>) {
    this.vacuumCallback = callback
  }

  subscribeToIndexMutations(listener: () => void): () => void {
    this.indexMutationListeners.push(listener)
    return () => {
      this.indexMutationListeners = this.indexMutationListeners.filter(
        (l) => l !== listener,
      )
    }
  }

  private notifyIndexMutated() {
    for (const listener of this.indexMutationListeners) {
      listener()
    }
  }

  async performSimilaritySearch(
    queryVector: number[],
    embeddingModel: EmbeddingModelClient,
    options: {
      minSimilarity: number
      limit: number
      scope?: EmbeddingSearchScope
    },
  ): Promise<
    (Omit<SelectEmbedding, 'embedding'> & {
      similarity: number
    })[]
  > {
    return await this.repository.performSimilaritySearch(
      queryVector,
      embeddingModel,
      options,
    )
  }

  async getAllIndexedChunks(
    embeddingModel: EmbeddingModelClient,
  ): Promise<Omit<SelectEmbedding, 'embedding'>[]> {
    return await this.repository.getAllIndexedChunks(embeddingModel)
  }

  async getIndexedChunksByPaths(
    paths: readonly string[],
    embeddingModel: EmbeddingModelClient,
  ): Promise<Omit<SelectEmbedding, 'embedding'>[]> {
    return await this.repository.getIndexedChunksByPaths(paths, embeddingModel)
  }

  async getEmbeddingIndexSummary(
    embeddingModel: EmbeddingModelClient,
  ): Promise<EmbeddingIndexSummary> {
    return await this.repository.getEmbeddingIndexSummary(embeddingModel)
  }

  async getVectorsByFilePath(
    filePath: string,
    embeddingModel: EmbeddingModelClient,
  ): Promise<SelectEmbedding[]> {
    return await this.repository.getVectorsByFilePath(filePath, embeddingModel)
  }

  async getAllIndexedChunkMetadata(
    embeddingModel: EmbeddingModelClient,
  ): Promise<IndexedChunkMetadata[]> {
    return await this.repository.getAllIndexedChunkMetadata(embeddingModel)
  }

  async performSimilaritySearchMetadata(
    queryVector: number[],
    embeddingModel: EmbeddingModelClient,
    options: {
      minSimilarity: number
      limit: number
      scope?: EmbeddingSearchScope
    },
  ): Promise<EmbeddingSearchMetadata[]> {
    return await this.repository.performSimilaritySearchMetadata(
      queryVector,
      embeddingModel,
      options,
    )
  }

  async getIndexedChunksByIds(
    ids: readonly number[],
    embeddingModel: EmbeddingModelClient,
  ): Promise<Omit<SelectEmbedding, 'embedding'>[]> {
    return await this.repository.getIndexedChunksByIds(ids, embeddingModel)
  }

  async getVectorChunkMetadataPageByPath(
    filePath: string,
    embeddingModel: EmbeddingModelClient,
    options: {
      afterId?: number
      limit?: number
    } = {},
  ): Promise<IndexedChunkMetadata[]> {
    return await this.repository.getVectorChunkMetadataPageByPath(
      filePath,
      embeddingModel,
      options,
    )
  }

  async getVectorEmbeddingsByIds(
    ids: readonly number[],
    embeddingModel: EmbeddingModelClient,
  ): Promise<Omit<SelectEmbedding, 'content'>[]> {
    return await this.repository.getVectorEmbeddingsByIds(ids, embeddingModel)
  }

  /**
   * Updates the vault index. Returns true if the index changed
   * (files were re-indexed or stale vectors were deleted), so callers
   * can invalidate derived caches such as the BM25 index.
   */
  async updateVaultIndex(
    embeddingModel: EmbeddingModelClient,
    options: {
      chunkSize: number
      chunkOverlap?: number
      chunkStrategy?: 'markdown_structure' | 'token_window'
      excludePatterns: string[]
      includePatterns: string[]
      reindexAll?: boolean
      excludeOpenFiles?: boolean
      /** Apply only the coalesced vault mutations when supplied. */
      dirtyMutations?: readonly EmbeddingIndexMutation[]
      /** Treat partial file/chunk failures as a failed model rebuild. */
      requireComplete?: boolean
      /** Abort the operation when this signal is cancelled. */
      signal?: AbortSignal
      /** Optional inactivity limit, primarily for explicit full rebuilds. */
      timeoutMs?: number
    },
    updateProgress?: (indexProgress: IndexProgress) => void,
    onSummary?: (summary: {
      totalFiles: number
      failedFiles: number
      failedChunks: number
      saved: boolean
    }) => void,
  ): Promise<boolean> {
    const abortContext = createIndexAbortContext(
      options.signal,
      options.timeoutMs,
    )
    let completedChunks = 0
    try {
      return await this.updateVaultIndexInternal(
        embeddingModel,
        { ...options, signal: abortContext.signal },
        (progress) => {
          if (progress.completedChunks > completedChunks) {
            completedChunks = progress.completedChunks
            abortContext.markProgress()
          }
          updateProgress?.(progress)
        },
        () => abortContext.timedOut,
        onSummary,
      )
    } finally {
      if (abortContext.signal.aborted) {
        await this.requestSave()
      }
      abortContext.dispose()
    }
  }

  private async updateVaultIndexInternal(
    embeddingModel: EmbeddingModelClient,
    options: {
      chunkSize: number
      chunkOverlap?: number
      chunkStrategy?: 'markdown_structure' | 'token_window'
      excludePatterns: string[]
      includePatterns: string[]
      reindexAll?: boolean
      excludeOpenFiles?: boolean
      /** Apply only the coalesced vault mutations when supplied. */
      dirtyMutations?: readonly EmbeddingIndexMutation[]
      /** Treat partial file/chunk failures as a failed model rebuild. */
      requireComplete?: boolean
      signal?: AbortSignal
    },
    updateProgress?: (indexProgress: IndexProgress) => void,
    isTimedOut: () => boolean = () => false,
    onSummary?: (summary: {
      totalFiles: number
      failedFiles: number
      failedChunks: number
      saved: boolean
    }) => void,
  ): Promise<boolean> {
    throwIfIndexAborted(options.signal, isTimedOut())
    this.startupDiagnostics?.mark('embedding:index:plan', {
      phase: 'start',
      reindexAll: Boolean(options.reindexAll),
      dirtyMutationCount: options.dirtyMutations?.length ?? null,
    })
    let filesToIndex: TFile[]
    let deletedStaleVectors = false
    if (options.reindexAll) {
      filesToIndex = await this.getFilesToIndex({
        embeddingModel: embeddingModel,
        excludePatterns: options.excludePatterns,
        includePatterns: options.includePatterns,
        reindexAll: true,
        excludeOpenFiles: options.excludeOpenFiles,
        signal: options.signal,
        isTimedOut,
      })
      throwIfIndexAborted(options.signal, isTimedOut())
      await this.repository.clearAllVectors(embeddingModel)
      this.notifyIndexMutated()
      deletedStaleVectors = true
    } else if (options.dirtyMutations) {
      const dirtyPlan = await this.getFilesToIndexForMutations({
        mutations: options.dirtyMutations,
        excludePatterns: options.excludePatterns,
        includePatterns: options.includePatterns,
        excludeOpenFiles: options.excludeOpenFiles,
        signal: options.signal,
        isTimedOut,
      })
      throwIfIndexAborted(options.signal, isTimedOut())
      filesToIndex = dirtyPlan.filesToIndex
      deletedStaleVectors = dirtyPlan.pathsToDelete.length > 0
      await this.repository.deleteVectorsForMultipleFiles(
        dirtyPlan.pathsToDelete,
        embeddingModel,
      )
      if (filesToIndex.length > 0 || deletedStaleVectors) {
        this.notifyIndexMutated()
      }
    } else {
      deletedStaleVectors =
        await this.deleteVectorsForDeletedFiles(embeddingModel)
      throwIfIndexAborted(options.signal, isTimedOut())
      filesToIndex = await this.getFilesToIndex({
        embeddingModel: embeddingModel,
        excludePatterns: options.excludePatterns,
        includePatterns: options.includePatterns,
        excludeOpenFiles: options.excludeOpenFiles,
        signal: options.signal,
        isTimedOut,
      })
      throwIfIndexAborted(options.signal, isTimedOut())
      await this.repository.deleteVectorsForMultipleFiles(
        filesToIndex.map((file) => file.path),
        embeddingModel,
      )
      if (filesToIndex.length > 0) this.notifyIndexMutated()
    }

    if (filesToIndex.length === 0) {
      let saved = true
      if (deletedStaleVectors) {
        this.notifyIndexMutated()
        saved = await this.requestSave()
      }
      this.startupDiagnostics?.mark('embedding:index:plan', {
        phase: 'empty',
        deletedStaleVectors,
      })
      onSummary?.({ totalFiles: 0, failedFiles: 0, failedChunks: 0, saved })
      return deletedStaleVectors
    }

    this.startupDiagnostics?.mark('embedding:index:plan', {
      phase: 'ready',
      files: filesToIndex.length,
    })

    const failedFiles: { path: string; error: string }[] = []
    const contentChunks = (
      await mapWithConcurrency(
        filesToIndex,
        FILE_READ_CONCURRENCY,
        async (file) => {
          try {
            throwIfIndexAborted(options.signal, isTimedOut())
            const source = await new SourceTextReader(this.app).read(file.path)
            const fileContent = source?.text ?? ''
            throwIfIndexAborted(options.signal, isTimedOut())
            // Remove null bytes from the content
            // eslint-disable-next-line no-control-regex -- Strip NUL bytes before chunking note content.
            const sanitizedContent = fileContent.replace(/\x00/g, '')
            if (!sanitizedContent.trim()) {
              return []
            }

            const fileDocuments = source?.document
              ? documentEmbeddingChunks(source)
              : await chunkMarkdownForEmbedding(sanitizedContent, {
                  chunkSize: options.chunkSize,
                  chunkOverlap: options.chunkOverlap ?? 0,
                  chunkStrategy: options.chunkStrategy ?? 'token_window',
                })
            return fileDocuments.map(
              (chunk): Omit<InsertEmbedding, 'model' | 'dimension'> => {
                const termStats = computeTermFreq(chunk.pageContent)
                return {
                  path: file.path,
                  mtime: file.stat.mtime,
                  content: chunk.pageContent,
                  metadata: {
                    ...chunk.metadata,
                    startLine: chunk.metadata.startLine,
                    endLine: chunk.metadata.endLine,
                    termFreq: termStats.termFreq,
                    termLength: termStats.length,
                  },
                }
              },
            )
          } catch (error) {
            if (options.signal?.aborted) {
              throw new EmbeddingIndexAbortError(
                isTimedOut()
                  ? 'Embedding index rebuild timed out'
                  : 'Embedding index rebuild cancelled',
              )
            }
            failedFiles.push({
              path: file.path,
              error: error instanceof Error ? error.message : 'Unknown error',
            })
            return [] // Return empty array for failed files
          }
        },
      )
    ).flat()

    throwIfIndexAborted(options.signal, isTimedOut())

    if (failedFiles.length > 0) {
      const errorDetails =
        `Failed to process ${failedFiles.length} file(s):\n\n` +
        failedFiles
          .map(({ path, error }) => `File: ${path}\nError: ${error}`)
          .join('\n\n')

      this.reportError(
        t('ui.main.vectorChunkTitle'),
        t('ui.main.vectorChunkMessage'),
        `[Error Log]\n\n${errorDetails}`,
      )
    }

    if (contentChunks.length === 0 && failedFiles.length > 0) {
      onSummary?.({
        totalFiles: filesToIndex.length,
        failedFiles: failedFiles.length,
        failedChunks: 0,
        saved: false,
      })
      throw new Error('All files failed to process. Stopping indexing process.')
    }
    if (contentChunks.length === 0) {
      this.notifyIndexMutated()
      const saved = await this.requestSave()
      onSummary?.({
        totalFiles: filesToIndex.length,
        failedFiles: failedFiles.length,
        failedChunks: 0,
        saved,
      })
      return deletedStaleVectors || filesToIndex.length > 0
    }

    updateProgress?.({
      completedChunks: 0,
      totalChunks: contentChunks.length,
      totalFiles: filesToIndex.length,
    })

    let completedChunks = 0
    const batchChunks = chunkArray(contentChunks, 100)
    const failedChunks: {
      path: string
      metadata: VectorMetaData
      error: string
    }[] = []
    let indexingError: unknown = null

    // Batch chunks per embedding API call to reduce request overhead.
    const EMBEDDING_BATCH_SIZE = 32

    try {
      for (const batchChunk of batchChunks) {
        const firstFailureIndex = failedChunks.length
        throwIfIndexAborted(options.signal, isTimedOut())
        await yieldToMainThread()
        // Filter out invalid chunks before sending them to the API
        const validChunks = batchChunk.filter((chunk) => {
          if (chunk.content.length === 0) {
            failedChunks.push({
              path: chunk.path,
              metadata: chunk.metadata,
              error: `Chunk content is empty in file: ${chunk.path}`,
            })
            return false
          }
          if (chunk.content.includes('\x00')) {
            // this should never happen because we remove null bytes from the content
            failedChunks.push({
              path: chunk.path,
              metadata: chunk.metadata,
              error: `Chunk content contains null bytes in file: ${chunk.path}`,
            })
            return false
          }
          return true
        })

        const embeddingChunks: InsertEmbedding[] = []
        for (const subBatch of chunkArray(validChunks, EMBEDDING_BATCH_SIZE)) {
          try {
            throwIfIndexAborted(options.signal, isTimedOut())
            const requestEmbeddings = () =>
              backOff(
                async () => {
                  throwIfIndexAborted(options.signal, isTimedOut())
                  for (const chunk of subBatch) {
                    if (chunk.metadata.sourceKind !== 'document') continue
                    const file = this.app.vault.getFileByPath(chunk.path)
                    const settings = documentQueue(this.app).settings
                    if (
                      !file ||
                      !shouldIndexSource(file, settings, true) ||
                      settings?.verbex.search.documents.embedConsentModelId !==
                        embeddingModel.id
                    ) {
                      throw new EmbeddingIndexAbortError(
                        'Document embedding consent changed',
                      )
                    }
                  }
                  return abortable(
                    embeddingModel.getEmbeddings(
                      subBatch.map((chunk) => chunk.content),
                      { signal: options.signal },
                    ),
                    options.signal,
                    isTimedOut,
                  )
                },
                {
                  numOfAttempts: 8,
                  startingDelay: 2000,
                  timeMultiple: 2,
                  // Keep cancellation responsive even while waiting between
                  // rate-limit retries. The API request itself remains
                  // cancellable through the signal below.
                  maxDelay: 1000,
                  retry: (error: unknown) => {
                    if (options.signal?.aborted) return false
                    if (
                      error instanceof LLMRateLimitExceededException ||
                      (error as { status: unknown }).status === 429
                    ) {
                      updateProgress?.({
                        completedChunks,
                        totalChunks: contentChunks.length,
                        totalFiles: filesToIndex.length,
                        waitingForRateLimit: true,
                      })
                      return true
                    }
                    return false
                  },
                },
              )
            const embeddings = this.startupDiagnostics
              ? await this.startupDiagnostics.measure(
                  'embedding:index:api-batch',
                  requestEmbeddings,
                  { chunkCount: subBatch.length },
                )
              : await requestEmbeddings()

            throwIfIndexAborted(options.signal, isTimedOut())
            if (embeddings.length !== subBatch.length) {
              throw new Error(
                `Embedding response length mismatch: expected ${subBatch.length}, received ${embeddings.length}.`,
              )
            }

            embeddingChunks.push(
              ...subBatch.map((chunk, index) => ({
                path: chunk.path,
                mtime: chunk.mtime,
                content: chunk.content,
                model: embeddingModel.id,
                dimension: embeddingModel.dimension,
                embedding: embeddings[index],
                metadata: chunk.metadata,
              })),
            )

            completedChunks += subBatch.length
            updateProgress?.({
              completedChunks,
              totalChunks: contentChunks.length,
              totalFiles: filesToIndex.length,
            })
          } catch (error) {
            if (options.signal?.aborted || isEmbeddingIndexAbortError(error)) {
              throw new EmbeddingIndexAbortError(
                isTimedOut()
                  ? 'Embedding index rebuild timed out'
                  : 'Embedding index rebuild cancelled',
              )
            }
            const kind = classifyEmbeddingError(error)
            if (
              kind === 'runtime_missing' ||
              kind === 'configuration' ||
              kind === 'authentication' ||
              kind === 'connectivity' ||
              kind === 'timeout'
            ) {
              throw error
            }
            for (const chunk of subBatch) {
              failedChunks.push({
                path: chunk.path,
                metadata: chunk.metadata,
                error:
                  error instanceof Error ? error.message : coerceString(error),
              })
            }
          }
        }

        // If all chunks in this batch failed, stop processing
        if (embeddingChunks.length === 0 && batchChunk.length > 0) {
          throw new Error(
            `All chunks in batch failed to embed. Stopping indexing process. ${failedChunks[firstFailureIndex]?.error ?? ''}`,
          )
        }
        throwIfIndexAborted(options.signal, isTimedOut())
        if (this.startupDiagnostics) {
          await this.startupDiagnostics.measure(
            'embedding:index:insert',
            () => this.repository.insertVectors(embeddingChunks),
            { vectorCount: embeddingChunks.length },
          )
        } else {
          await this.repository.insertVectors(embeddingChunks)
        }
        await yieldToMainThread()
      }
    } catch (error) {
      indexingError = error
      if (!isEmbeddingIndexAbortError(error)) {
        const kind = classifyEmbeddingError(error)
        const ui = embeddingErrorUi(kind)
        if (ui === 'notice') {
          showEmbeddingErrorNotice(kind, error)
        } else {
          const errorDetails =
            `Failed to process ${failedChunks.length} file(s):\n\n` +
            failedChunks
              .map((chunk) => `File: ${chunk.path}\nError: ${chunk.error}`)
              .join('\n\n')

          this.reportError(
            t('ui.main.vectorEmbeddingTitle'),
            t('ui.main.vectorEmbeddingMessage'),
            `[Error Log]\n\n${error instanceof Error ? error.message : coerceString(error)}\n\n${errorDetails}`,
          )
        }
      }
    } finally {
      // Vectors were deleted and/or inserted by this point, even when the
      // embedding loop was interrupted by an error
      this.notifyIndexMutated()
      const saved = await this.requestSave()
      onSummary?.({
        totalFiles: filesToIndex.length,
        failedFiles: failedFiles.length,
        failedChunks: failedChunks.length,
        saved,
      })
      this.startupDiagnostics?.mark('embedding:index:finished', {
        ok: indexingError === null,
        failedFiles: failedFiles.length,
        failedChunks: failedChunks.length,
      })
    }
    if (indexingError) {
      throw indexingError instanceof Error
        ? indexingError
        : new Error(coerceString(indexingError))
    }
    if (
      options.requireComplete &&
      (failedFiles.length > 0 || failedChunks.length > 0)
    ) {
      throw new Error(
        `Embedding index incomplete: ${failedFiles.length} file failure(s), ${failedChunks.length} chunk failure(s).`,
      )
    }
    return true
  }

  async clearAllVectors(embeddingModel: EmbeddingModelClient) {
    await this.repository.clearAllVectors(embeddingModel)
    this.notifyIndexMutated()
    await this.requestVacuum()
    await this.requestSave()
  }

  private async deleteVectorsForDeletedFiles(
    embeddingModel: EmbeddingModelClient,
  ): Promise<boolean> {
    const indexedFilePaths =
      await this.repository.getIndexedFilePaths(embeddingModel)
    const eligibility = await Promise.all(
      indexedFilePaths.map(async (filePath) => {
        const file = this.app.vault.getFileByPath(filePath)
        if (
          !file ||
          !shouldIndexSource(file, documentQueue(this.app).settings, true)
        )
          return filePath
        if (
          isDocumentPath(filePath) &&
          !(await new SourceTextReader(this.app).read(filePath))
        )
          return filePath
        if (
          await isGeneratedSidecar(
            this.app,
            file,
            documentQueue(this.app).settings,
          )
        )
          return filePath
        return null
      }),
    )
    const deletedPaths = eligibility.filter(
      (path): path is string => path !== null,
    )
    if (deletedPaths.length === 0) {
      return false
    }
    await this.repository.deleteVectorsForMultipleFiles(
      deletedPaths,
      embeddingModel,
    )
    return true
  }

  private async getFilesToIndexForMutations({
    mutations,
    excludePatterns,
    includePatterns,
    excludeOpenFiles,
    signal,
    isTimedOut = () => false,
  }: {
    mutations: readonly EmbeddingIndexMutation[]
    excludePatterns: string[]
    includePatterns: string[]
    excludeOpenFiles?: boolean
    signal?: AbortSignal
    isTimedOut?: () => boolean
  }): Promise<{ filesToIndex: TFile[]; pathsToDelete: string[] }> {
    throwIfIndexAborted(signal, isTimedOut())
    const openFilePaths = excludeOpenFiles
      ? this.getOpenFilePaths()
      : new Set<string>()
    const filesByPath = new Map<string, TFile>()
    const pathsToDelete = new Set<string>()

    for (const mutation of mutations) {
      throwIfIndexAborted(signal, isTimedOut())
      if (mutation.type === 'remove') {
        pathsToDelete.add(mutation.path)
        continue
      }

      const file = this.app.vault.getFileByPath(mutation.path)
      if (
        !file ||
        !this.shouldIndexFileForOptions(file, excludePatterns, includePatterns)
      ) {
        if (!openFilePaths.has(mutation.path)) {
          pathsToDelete.add(mutation.path)
        }
        continue
      }
      if (openFilePaths.has(file.path)) {
        continue
      }
      pathsToDelete.add(file.path)
      filesByPath.set(file.path, file)
    }

    return {
      filesToIndex: [...filesByPath.values()],
      pathsToDelete: [...pathsToDelete],
    }
  }

  private async getFilesToIndex({
    embeddingModel,
    excludePatterns,
    includePatterns,
    reindexAll,
    excludeOpenFiles,
    signal,
    isTimedOut = () => false,
  }: {
    embeddingModel: EmbeddingModelClient
    excludePatterns: string[]
    includePatterns: string[]
    reindexAll?: boolean
    excludeOpenFiles?: boolean
    signal?: AbortSignal
    isTimedOut?: () => boolean
  }): Promise<TFile[]> {
    throwIfIndexAborted(signal, isTimedOut())
    let filesToIndex = listIndexableSources(
      this.app,
      documentQueue(this.app).settings,
      true,
    )

    filesToIndex = filesToIndex.filter((file) =>
      this.shouldIndexFileForOptions(file, excludePatterns, includePatterns),
    )

    if (excludeOpenFiles) {
      const openFilePaths = this.getOpenFilePaths()
      if (openFilePaths.size > 0) {
        filesToIndex = filesToIndex.filter(
          (file) => !openFilePaths.has(file.path),
        )
      }
    }

    if (reindexAll) {
      return filesToIndex
    }

    // Single query for all indexed mtimes instead of one query per file
    const indexedMtimes =
      await this.repository.getIndexedFileMtimes(embeddingModel)

    const documentVersions = filesToIndex.some((file) =>
      isDocumentPath(file.path),
    )
      ? await this.repository.getIndexedDocumentVersions(embeddingModel)
      : new Map<string, string>()
    filesToIndex = await mapWithConcurrency(
      filesToIndex,
      FILE_READ_CONCURRENCY,
      async (file) => {
        throwIfIndexAborted(signal, isTimedOut())
        const indexedMtime = indexedMtimes.get(file.path)
        if (indexedMtime === undefined) {
          // Not indexed yet — skip empty files
          const source = await new SourceTextReader(this.app).read(file.path)
          const fileContent = source?.text ?? ''
          throwIfIndexAborted(signal, isTimedOut())
          return fileContent.length === 0 ? null : file
        }
        if (isDocumentPath(file.path)) {
          const source = await new SourceTextReader(this.app).read(file.path)
          if (!source?.document) return null
          return file.stat.mtime !== indexedMtime ||
            documentVersions.get(file.path) !==
              `${extractorKey(source.document)}:${source.revision}`
            ? file
            : null
        }
        return file.stat.mtime > indexedMtime ? file : null
      },
    ).then((files) => files.filter(Boolean) as TFile[])

    return filesToIndex
  }

  private shouldIndexFileForOptions(
    file: TFile,
    excludePatterns: string[],
    includePatterns: string[],
  ): boolean {
    if (!shouldIndexSource(file, documentQueue(this.app).settings, true))
      return false
    if (excludePatterns.some((pattern) => minimatch(file.path, pattern))) {
      return false
    }
    return (
      includePatterns.length === 0 ||
      includePatterns.some((pattern) => minimatch(file.path, pattern))
    )
  }

  private getOpenFilePaths(): Set<string> {
    const openFilePaths = new Set<string>()
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file) {
        openFilePaths.add(leaf.view.file.path)
      }
    })
    return openFilePaths
  }

  async getEmbeddingStats(): Promise<EmbeddingDbStats[]> {
    return await this.repository.getEmbeddingStats()
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  let completed = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
      completed += 1
      if (completed % COOPERATIVE_YIELD_EVERY === 0) {
        await yieldToMainThread()
      }
    }
  })
  await Promise.all(workers)
  return results
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => runtimeTimers.setTimeout(resolve, 0))
}

export type MarkdownEmbeddingChunk = {
  pageContent: string
  metadata: {
    startLine: number
    endLine: number
  }
}

export async function chunkMarkdownForEmbedding(
  content: string,
  options: {
    chunkSize: number
    chunkOverlap?: number
    chunkStrategy?: 'markdown_structure' | 'token_window'
  },
): Promise<MarkdownEmbeddingChunk[]> {
  if (options.chunkStrategy !== 'markdown_structure') {
    return chunkMarkdownByWindow(
      content,
      options.chunkSize,
      options.chunkOverlap ?? 0,
    )
  }

  return chunkMarkdownByStructure(content, options.chunkSize)
}

/** Lightweight character window splitter; avoids pulling the full LangChain runtime. */
function chunkMarkdownByWindow(
  content: string,
  chunkSize: number,
  requestedOverlap: number,
): MarkdownEmbeddingChunk[] {
  if (!content.trim()) return []
  const size = Math.max(1, chunkSize)
  const overlap = Math.max(0, Math.min(requestedOverlap, size - 1))
  const chunks: MarkdownEmbeddingChunk[] = []
  let start = 0
  while (start < content.length) {
    const end = Math.min(content.length, start + size)
    const pageContent = content.slice(start, end).trim()
    if (pageContent) {
      const startLine = content.slice(0, start).split('\n').length
      const endLine = content.slice(0, end).split('\n').length
      chunks.push({ pageContent, metadata: { startLine, endLine } })
    }
    if (end >= content.length) break
    start = end - overlap
  }
  return chunks
}

type MarkdownBlock = {
  text: string
  startLine: number
  endLine: number
}

function chunkMarkdownByStructure(
  content: string,
  chunkSize: number,
): MarkdownEmbeddingChunk[] {
  const blocks = splitMarkdownBlocks(content)
  const chunks: MarkdownEmbeddingChunk[] = []
  let current: MarkdownBlock | null = null

  const flush = () => {
    if (!current?.text.trim()) return
    chunks.push({
      pageContent: current.text.trim(),
      metadata: {
        startLine: current.startLine,
        endLine: current.endLine,
      },
    })
    current = null
  }

  for (const block of blocks) {
    if (block.text.length > chunkSize) {
      flush()
      chunks.push(...splitLargeBlock(block, chunkSize))
      continue
    }

    if (!current) {
      current = block
      continue
    }

    if (startsWithHeading(block.text)) {
      flush()
      current = block
      continue
    }

    const joined = [current.text, block.text].join('\n\n')
    if (joined.length > chunkSize) {
      flush()
      current = block
    } else {
      current = {
        text: joined,
        startLine: current.startLine,
        endLine: block.endLine,
      }
    }
  }
  flush()
  return chunks
}

function startsWithHeading(text: string): boolean {
  return /^#{1,6}\s+/.test(text.trimStart())
}

function splitMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.split('\n')
  const blocks: MarkdownBlock[] = []
  let current: MarkdownBlock | null = null

  const flush = () => {
    if (!current?.text.trim()) return
    blocks.push({
      ...current,
      text: current.text.trim(),
    })
    current = null
  }

  const append = (line: string, lineNumber: number) => {
    if (!current) {
      current = {
        text: line,
        startLine: lineNumber,
        endLine: lineNumber,
      }
      return
    }
    current.text = `${current.text}\n${line}`
    current.endLine = lineNumber
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = index + 1
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      flush()
      append(line, lineNumber)
      continue
    }
    append(line, lineNumber)
  }
  flush()
  return blocks
}

function splitLargeBlock(
  block: MarkdownBlock,
  chunkSize: number,
): MarkdownEmbeddingChunk[] {
  const lines = block.text.split('\n')
  const chunks: MarkdownEmbeddingChunk[] = []
  let text = ''
  let startLine = block.startLine

  const flush = (endLine: number) => {
    if (!text.trim()) return
    chunks.push({
      pageContent: text.trim(),
      metadata: { startLine, endLine },
    })
    text = ''
    startLine = endLine + 1
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = block.startLine + index
    const next = text ? `${text}\n${line}` : line
    if (text && next.length > chunkSize) {
      flush(lineNumber - 1)
      text = line
      startLine = lineNumber
    } else {
      text = next
    }
  }
  flush(block.endLine)
  return chunks
}
