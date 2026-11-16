import { DEFAULT_EMBEDDING_MODELS, DEFAULT_PROVIDERS } from '../../../constants'
import { PROVIDER_TYPES } from '../../../types/provider.types'

type Entry = Record<string, unknown>
const entries = (value: unknown, fallback: readonly unknown[] = []): Entry[] =>
  ((Array.isArray(value) ? value : fallback) as readonly unknown[]).filter(
    (item): item is Entry => !!item && typeof item === 'object',
  )

/** Remove unknown provider types and their models before schema validation. */
export function removeRetiredProviders(data: Entry): Entry {
  const known = new Set<string>(PROVIDER_TYPES)
  const providers = entries(data.providers, DEFAULT_PROVIDERS)
  const removedProviders = new Set(
    providers.filter((p) => !known.has(String(p.type))).map((p) => p.id),
  )
  const remainingProviders = providers.filter(
    (p) => !removedProviders.has(p.id),
  )
  const keepModel = (model: Entry) =>
    (known.has(String(model.providerType)) || model.providerType === 'local') &&
    !removedProviders.has(model.providerId)
  const chat = entries(data.chatModels)
  const embedding = entries(data.embeddingModels, DEFAULT_EMBEDDING_MODELS)
  const chatModels = chat.filter(keepModel)
  const embeddingModels = embedding.filter(keepModel)
  const removedChat = new Set(
    chat.filter((m) => !keepModel(m)).map((m) => m.id),
  )
  const removedEmbedding = new Set(
    embedding.filter((m) => !keepModel(m)).map((m) => m.id),
  )
  const chatFallback = chatModels[0]?.id ?? ''
  const embeddingFallback = embeddingModels[0]?.id ?? ''
  const repair = (value: unknown, removed: Set<unknown>, fallback: unknown) =>
    removed.has(value) ? fallback : value
  const next: Entry = {
    ...data,
    providers: remainingProviders,
    chatModels,
    embeddingModels,
    chatModelId: repair(data.chatModelId, removedChat, chatFallback),
    applyModelId: repair(data.applyModelId, removedChat, chatFallback),
    embeddingModelId: repair(
      data.embeddingModelId,
      removedEmbedding,
      embeddingFallback,
    ),
  }
  if (data.modelAliases && typeof data.modelAliases === 'object') {
    next.modelAliases = Object.fromEntries(
      Object.entries(data.modelAliases).map(([key, value]) => [
        key,
        repair(value, removedChat, chatFallback),
      ]),
    )
  }
  const state = data.embeddingIndexState as Entry | null | undefined
  if (
    state &&
    ['activeModelId', 'targetModelId', 'previousModelId'].some((key) =>
      removedEmbedding.has(state[key]),
    )
  ) {
    // A removed previous model does not invalidate the current index lifecycle.
    const currentRemoved =
      removedEmbedding.has(state.activeModelId) ||
      removedEmbedding.has(state.targetModelId)
    next.embeddingIndexState = !currentRemoved
      ? {
          ...state,
          previousModelId:
            embeddingFallback === '' ? undefined : embeddingFallback,
        }
      : embeddingFallback
        ? {
            phase: 'pending',
            activeModelId: repair(
              state.activeModelId,
              removedEmbedding,
              embeddingFallback,
            ),
            targetModelId: removedEmbedding.has(state.activeModelId)
              ? embeddingFallback
              : repair(
                  state.targetModelId,
                  removedEmbedding,
                  embeddingFallback,
                ),
          }
        : null
  }
  const verbex = data.verbex as Entry | undefined
  const search = verbex?.search as Entry | undefined
  const documents = search?.documents as Entry | undefined
  if (documents && removedEmbedding.has(documents.embedConsentModelId)) {
    // Consent for one model must not authorize disclosure to a replacement model.
    const { embedConsentModelId: _removed, ...rest } = documents
    next.verbex = { ...verbex, search: { ...search, documents: rest } }
  }
  return next
}
