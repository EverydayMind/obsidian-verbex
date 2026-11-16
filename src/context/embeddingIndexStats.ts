import { PGLITE_DB_PATH } from '../constants'
import type { RAGEngine } from '../core/rag/ragEngine'
import type { VerbexEmbeddingIndexStatus } from '../verbex/types'

import { SemanticSearchProvider } from './ContextBuilder'

type ProviderWithVectorIndex = SemanticSearchProvider &
  Pick<RAGEngine, 'getVectorManager' | 'getEmbeddingModel'>

type EmbeddingIndexSummary = {
  rowCount: number
  indexedFilesCount: number
  totalDataBytes: number
  contentBytes: number
  embeddingBytes: number
  metadataBytes: number
  tableBytes: number
  indexBytes: number
}

function hasVectorIndexAccess(
  provider: SemanticSearchProvider,
): provider is ProviderWithVectorIndex {
  const candidate = provider as Partial<
    Pick<RAGEngine, 'getVectorManager' | 'getEmbeddingModel'>
  >
  return (
    typeof candidate.getVectorManager === 'function' &&
    typeof candidate.getEmbeddingModel === 'function'
  )
}

export async function collectEmbeddingIndexStats(
  getProvider: () =>
    | Promise<SemanticSearchProvider | null>
    | SemanticSearchProvider
    | null,
): Promise<VerbexEmbeddingIndexStatus | null> {
  const provider = await getProvider()
  if (!provider || !hasVectorIndexAccess(provider)) {
    return null
  }
  const vectorManager = provider.getVectorManager()
  const embeddingModel = provider.getEmbeddingModel()
  if (!vectorManager || !embeddingModel) {
    return null
  }
  const summaryReader = vectorManager as typeof vectorManager & {
    getEmbeddingIndexSummary?: (
      model: typeof embeddingModel,
    ) => Promise<EmbeddingIndexSummary>
  }
  if (summaryReader.getEmbeddingIndexSummary) {
    const summary = await summaryReader.getEmbeddingIndexSummary(embeddingModel)
    return {
      indexPath: PGLITE_DB_PATH,
      dimension: embeddingModel.dimension,
      ...summary,
      model: embeddingModel.id,
    }
  }

  // Compatibility fallback for older test doubles/providers. Production
  // VectorManager uses the aggregate path above and never materializes every
  // indexed chunk merely to count distinct files.
  const [allStats, allChunks] = await Promise.all([
    vectorManager.getEmbeddingStats(),
    vectorManager.getAllIndexedChunks(embeddingModel),
  ])
  const modelStats = allStats.find((stat) => stat.model === embeddingModel.id)
  const uniqueFiles = new Set(allChunks.map((chunk) => chunk.path))
  return {
    indexPath: PGLITE_DB_PATH,
    dimension: embeddingModel.dimension,
    rowCount: modelStats?.rowCount ?? 0,
    totalDataBytes: modelStats?.totalDataBytes ?? 0,
    ...(modelStats?.contentBytes !== undefined
      ? { contentBytes: modelStats.contentBytes }
      : {}),
    ...(modelStats?.embeddingBytes !== undefined
      ? { embeddingBytes: modelStats.embeddingBytes }
      : {}),
    ...(modelStats?.metadataBytes !== undefined
      ? { metadataBytes: modelStats.metadataBytes }
      : {}),
    ...(modelStats?.tableBytes !== undefined
      ? { tableBytes: modelStats.tableBytes }
      : {}),
    ...(modelStats?.indexBytes !== undefined
      ? { indexBytes: modelStats.indexBytes }
      : {}),
    indexedFilesCount: uniqueFiles.size,
    model: embeddingModel.id,
  }
}
