import {
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_PROVIDERS,
  LOCAL_E5_FP16_MODEL_ID,
} from '../../../constants'

/** Reset legacy provider and model settings while preserving unrelated preferences. */
export function resetLegacyModels(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const verbex = data.verbex as Record<string, unknown> | undefined
  const search = verbex?.search as Record<string, unknown> | undefined
  const documents = search?.documents as Record<string, unknown> | undefined
  return {
    ...data,
    version: 17,
    providers: [...DEFAULT_PROVIDERS],
    chatModels: [],
    embeddingModels: [...DEFAULT_EMBEDDING_MODELS],
    chatModelId: '',
    applyModelId: '',
    embeddingModelId: LOCAL_E5_FP16_MODEL_ID,
    modelAliases: {},
    embeddingIndexState: null,
    ...(documents
      ? {
          verbex: {
            ...verbex,
            search: {
              ...search,
              documents: { ...documents, embedConsentModelId: undefined },
            },
          },
        }
      : {}),
  }
}
