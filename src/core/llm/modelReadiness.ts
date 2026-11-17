import {
  PROVIDER_DEFAULT_BASE_URLS,
  PROVIDER_TYPES_INFO,
} from '../../constants'
import { t } from '../../i18n'
import { VerbexSettings } from '../../settings/schema/setting.types'
import { ChatModel } from '../../types/chat-model.types'
import { EmbeddingModel } from '../../types/embedding-model.types'
import { LLMProvider } from '../../types/provider.types'

import { ModelAlias, resolveChatModelId } from './modelSelection'
import { validateOpenAIToolConfiguration } from './openAIRequestPolicy'
import { OpenAIConfigurationError } from './responsesErrors'
import { chatModelSupportsTools } from './toolSupport'

/**
 * Fact states for "can this chat model actually be used right now", ordered
 * roughly by how early each check can run without a network call. See
 * §1.4 of provider_model_selection_plan.md ("selection readiness" /
 * "execution readiness" / "도구 readiness"). These are facts, not verdicts —
 * callers decide what UI/blocking behavior each status gets (facts-not-
 * judgments principle).
 */
export type ChatModelReadinessStatus =
  | 'unset'
  | 'selection_stale'
  | 'disabled'
  | 'provider_missing'
  | 'credentials_missing'
  | 'base_url_missing'
  | 'tools_unsupported'
  | 'ready'

export type ChatModelReadiness =
  | { status: 'unset'; modelId: string }
  | { status: 'selection_stale'; modelId: string }
  | { status: 'disabled'; modelId: string; model: ChatModel }
  | { status: 'provider_missing'; modelId: string; model: ChatModel }
  | {
      status: 'credentials_missing'
      modelId: string
      model: ChatModel
      provider: LLMProvider
    }
  | {
      status: 'base_url_missing'
      modelId: string
      model: ChatModel
      provider: LLMProvider
    }
  | {
      status: 'tools_unsupported'
      reason?: string
      modelId: string
      model: ChatModel
      provider: LLMProvider
    }
  | {
      status: 'ready'
      modelId: string
      model: ChatModel
      provider: LLMProvider
    }

/**
 * A model is "selection ready" once it exists, is enabled, and its provider
 * still exists — enough to appear as a valid choice in a dropdown or to be
 * auto-assigned on first registration. It does not guarantee an API call
 * will succeed (see execution/tool readiness below).
 */
const SELECTION_READY_STATUSES: ReadonlySet<ChatModelReadinessStatus> = new Set(
  ['credentials_missing', 'base_url_missing', 'tools_unsupported', 'ready'],
)

/**
 * Checks whether `modelId` can be used, in priority order: does it resolve
 * to a configured, enabled model with a configured provider (selection
 * readiness) — then, on top of that, does the provider have the static
 * credential/base URL it requires (execution readiness) — then, if
 * `requireTools` is set, does the model support tools. Returns the first
 * failing fact; callers needing more than one fact at once should call this
 * repeatedly with different `requireTools` values.
 */
export function checkChatModelReadiness(
  settings: VerbexSettings,
  modelId: string,
  options: { requireTools?: boolean } = {},
): ChatModelReadiness {
  const trimmed = modelId.trim()
  if (!trimmed) {
    return { status: 'unset', modelId: trimmed }
  }

  const model = settings.chatModels.find((m) => m.id === trimmed)
  if (!model) {
    return { status: 'selection_stale', modelId: trimmed }
  }
  if (model.enable === false) {
    return { status: 'disabled', modelId: trimmed, model }
  }

  const provider = settings.providers.find((p) => p.id === model.providerId)
  if (!provider) {
    return { status: 'provider_missing', modelId: trimmed, model }
  }

  const info = PROVIDER_TYPES_INFO[provider.type]
  if (info.requireApiKey && !provider.apiKey?.trim()) {
    return {
      status: 'credentials_missing',
      modelId: trimmed,
      model,
      provider,
    }
  }
  const effectiveBaseUrl =
    provider.baseUrl?.trim() || PROVIDER_DEFAULT_BASE_URLS[provider.type]
  if (info.requireBaseUrl && !effectiveBaseUrl) {
    return { status: 'base_url_missing', modelId: trimmed, model, provider }
  }

  if (options.requireTools && !chatModelSupportsTools({ settings, model })) {
    return { status: 'tools_unsupported', modelId: trimmed, model, provider }
  }
  if (options.requireTools) {
    try {
      validateOpenAIToolConfiguration(
        model,
        'toolTurnReasoningEffort' in model
          ? model.toolTurnReasoningEffort
          : undefined,
      )
    } catch (error) {
      if (!(error instanceof OpenAIConfigurationError)) throw error
      return {
        status: 'tools_unsupported',
        modelId: trimmed,
        model,
        provider,
        reason: error.message,
      }
    }
  }

  return { status: 'ready', modelId: trimmed, model, provider }
}

/** True once a model is a valid, selectable choice (see the type above). */
export function isSelectionReady(readiness: ChatModelReadiness): boolean {
  return SELECTION_READY_STATUSES.has(readiness.status)
}

/**
 * User-facing (Korean) explanation of a non-ready status, shared by the
 * submit pre-flight guard (Chat.tsx) and formatAgentErrorForUser.ts so both
 * surfaces describe the same fact the same way.
 */
export function formatChatModelReadinessMessage(
  readiness: ChatModelReadiness,
): string {
  switch (readiness.status) {
    case 'unset':
      return t('ui.modelReadiness.noChatModelsAreRegisteredAddA')
    case 'selection_stale':
      return t('ui.modelReadiness.theSelectedChatModelCouldNotBe')
    case 'disabled':
      return t('ui.modelReadiness.theSelectedChatModelIsDisabledEnable', {
        p0: readiness.modelId,
      })
    case 'provider_missing':
      return t('ui.modelReadiness.theProviderForTheSelectedChatModel', {
        p0: readiness.modelId,
      })
    case 'credentials_missing':
      if (readiness.provider.apiKeySecret)
        return t('ui.modelReadiness.keychainMissing')
      return t('ui.modelReadiness.providerHasNoAPIKeyEnterAn', {
        p0: readiness.provider.id,
      })
    case 'base_url_missing':
      return t('ui.modelReadiness.providerHasNoBaseURLEnterA', {
        p0: readiness.provider.id,
      })
    case 'tools_unsupported':
      if (readiness.reason) return readiness.reason
      return t('ui.modelReadiness.theSelectedChatModelDoesNotSupport', {
        p0: readiness.modelId,
      })
    case 'ready':
      return ''
  }
}

/** True only when a model is ready to actually call (credentials/base URL present, tools satisfied if required). */
export function isExecutionReady(readiness: ChatModelReadiness): boolean {
  return readiness.status === 'ready'
}

export function isModelSelectionReady(
  settings: VerbexSettings,
  modelId: string,
): boolean {
  return isSelectionReady(checkChatModelReadiness(settings, modelId))
}

/**
 * Readiness of whatever `resolveChatModelId` would actually pick for a run
 * (main default, a named alias, or an explicit step model), including its
 * fallback-with-warning semantics — `resolveChatModelId` itself is
 * unchanged; this only judges the model it lands on. Used by the submit
 * pre-flight gate and by `AgentRunCoordinator.run()` so neither calls a
 * provider API with an unusable model.
 */
export function checkRunModelReadiness(
  settings: VerbexSettings,
  options: {
    alias?: ModelAlias
    stepModel?: string | null
    requireTools?: boolean
  } = {},
): ChatModelReadiness {
  const resolved = resolveChatModelId({
    settings,
    alias: options.alias,
    stepModel: options.stepModel,
  })
  return checkChatModelReadiness(settings, resolved.modelId, {
    requireTools: options.requireTools,
  })
}

/**
 * §3.4 "첫 등록 자동 지정": if the current selection isn't selection-ready
 * (unset, stale, disabled, or its provider was removed), point it at the
 * first selection-ready model instead. A valid existing selection is never
 * touched, even if a "better" model is registered later.
 */
export function autoAssignFirstUsableModel(
  settings: VerbexSettings,
  currentModelId: string,
): string {
  if (currentModelId && isModelSelectionReady(settings, currentModelId)) {
    return currentModelId
  }
  const firstUsable = settings.chatModels.find((model) =>
    isModelSelectionReady(settings, model.id),
  )
  return firstUsable?.id ?? currentModelId
}

/**
 * §1.4 "선택 참조 정리": when one or more chat models are being removed
 * (single delete or provider delete cascading to its models), clear any
 * `chatModelId`/`applyModelId`/`modelAliases` entries that pointed at a
 * removed model so no stale reference survives the same settings write.
 * Untouched references are returned as-is.
 */
export function cleanupChatModelReferences(
  settings: Pick<
    VerbexSettings,
    'chatModelId' | 'applyModelId' | 'modelAliases'
  >,
  removedModelIds: ReadonlySet<string>,
): Pick<VerbexSettings, 'chatModelId' | 'applyModelId' | 'modelAliases'> {
  const chatModelId = removedModelIds.has(settings.chatModelId)
    ? ''
    : settings.chatModelId
  const applyModelId = removedModelIds.has(settings.applyModelId)
    ? ''
    : settings.applyModelId

  const modelAliases = { ...settings.modelAliases }
  for (const alias of ['default', 'fast', 'high_reasoning'] as const) {
    const value = modelAliases[alias]
    if (value && removedModelIds.has(value)) {
      delete modelAliases[alias]
    }
  }

  return { chatModelId, applyModelId, modelAliases }
}

/**
 * Embedding-side counterpart of cleanupChatModelReferences: if the current
 * `embeddingModelId` pointed at a removed embedding model, reassign it to
 * the first remaining one, or clear it if none remain.
 */
export function cleanupEmbeddingModelReference(
  remainingEmbeddingModels: readonly EmbeddingModel[],
  currentEmbeddingModelId: string,
  removedEmbeddingModelIds: ReadonlySet<string>,
): string {
  if (!removedEmbeddingModelIds.has(currentEmbeddingModelId)) {
    return currentEmbeddingModelId
  }
  return remainingEmbeddingModels[0]?.id ?? ''
}
