import { LOCAL_E5_FP16_MODEL_ID, PROVIDER_TYPES_INFO } from '../../constants'
import { VerbexSettings } from '../../settings/schema/setting.types'
import { EmbeddingModelClient } from '../../types/embedding'
import { getProviderClient } from '../llm/manager'

import { getLocalE5Client } from './localE5'

export const getEmbeddingModelClient = ({
  settings,
  embeddingModelId,
}: {
  settings: VerbexSettings
  embeddingModelId: string
}): EmbeddingModelClient => {
  const embeddingModel = settings.embeddingModels.find(
    (model) => model.id === embeddingModelId,
  )
  if (!embeddingModel) {
    throw new Error(`Embedding model ${embeddingModelId} not found`)
  }

  if (
    embeddingModel.id === LOCAL_E5_FP16_MODEL_ID &&
    embeddingModel.providerType === 'local'
  ) {
    return getLocalE5Client(settings.localEmbeddingDevice)
  }

  const provider = settings.providers.find(
    (provider) => provider.id === embeddingModel.providerId,
  )
  if (!provider) {
    throw new Error(`Provider ${embeddingModel.providerId} not found`)
  }
  if (!PROVIDER_TYPES_INFO[provider.type].supportEmbedding) {
    throw new Error(
      `Provider ${embeddingModel.providerId} does not support embeddings`,
    )
  }

  const providerClient = getProviderClient({
    settings,
    providerId: embeddingModel.providerId,
  })

  return {
    id: embeddingModel.id,
    dimension: embeddingModel.dimension,
    getEmbedding: (text: string, options?: { signal?: AbortSignal }) =>
      providerClient.getEmbedding(embeddingModel.model, text, {
        dimensions: embeddingModel.outputDimension,
        signal: options?.signal,
      }),
    getEmbeddings: (texts: string[], options?: { signal?: AbortSignal }) =>
      providerClient.getEmbeddings(embeddingModel.model, texts, {
        dimensions: embeddingModel.outputDimension,
        signal: options?.signal,
      }),
  }
}
