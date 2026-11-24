import { ModelProfile } from '../../../../core/llm/modelProfiles'
import { Locale, getCurrentLocale, t } from '../../../../i18n'
import { VerbexSettings } from '../../../../settings/schema/setting.types'
import { ChatModel } from '../../../../types/chat-model.types'

import { isOpenAiCompatibleChatModel } from './chatModelSettingsForm'

export type ChatModelWarning = {
  readonly id: string
  readonly message: string
}

function caveatApplies(caveatId: string, draft: ChatModel): boolean {
  if (caveatId === 'qwen-low-ignored') {
    return (
      isOpenAiCompatibleChatModel(draft) &&
      (draft.toolTurnReasoningEffort === 'low' ||
        draft.selectionReasoningEffort === 'low')
    )
  }
  if (caveatId === 'qwen-reasoning-disabled') {
    return (
      isOpenAiCompatibleChatModel(draft) &&
      (draft.toolTurnReasoningEffort === 'none' ||
        (draft.providerType === 'openrouter' &&
          draft.openRouterReasoning?.enabled === false))
    )
  }
  if (caveatId === 'inkling-disallow-fallbacks') {
    return (
      draft.providerType === 'openrouter' &&
      draft.openRouterProvider?.allowFallbacks === false
    )
  }
  return false
}

export function evaluateChatModelWarnings(
  draft: ChatModel,
  profile: ModelProfile | undefined,
  settings: VerbexSettings,
  locale: Locale = getCurrentLocale(),
): ChatModelWarning[] {
  const warnings: ChatModelWarning[] = []

  if (draft.providerType === 'openrouter') {
    const reasoning = draft.openRouterReasoning
    const hasReasoningObj =
      reasoning !== undefined &&
      (reasoning.maxTokens !== undefined ||
        reasoning.effort !== undefined ||
        reasoning.enabled !== undefined)

    // Rule 1: toolTurnReasoningEffort suppresses openRouterReasoning.
    if (draft.toolTurnReasoningEffort !== undefined && hasReasoningObj) {
      warnings.push({
        id: 'openrouter-reasoning-suppressed',
        message: t(
          'settings.chatModels.recommendedProfile.warnings.reasoningSuppressed',
        ),
      })
    }

    // Rule 2: internal combinations within openRouterReasoning.
    if (reasoning) {
      if (reasoning.maxTokens !== undefined && reasoning.effort !== undefined) {
        warnings.push({
          id: 'openrouter-reasoning-max-and-effort',
          message: t(
            'settings.chatModels.recommendedProfile.warnings.reasoningMaxAndEffort',
          ),
        })
      }
      if (
        reasoning.enabled === false &&
        (reasoning.maxTokens !== undefined || reasoning.effort !== undefined)
      ) {
        warnings.push({
          id: 'openrouter-reasoning-disabled-with-params',
          message: t(
            'settings.chatModels.recommendedProfile.warnings.reasoningDisabledWithParams',
          ),
        })
      }
    }

    // Rule 3: allowFallbacks === false.
    if (draft.openRouterProvider?.allowFallbacks === false) {
      warnings.push({
        id: 'openrouter-allow-fallbacks-false',
        message: t(
          'settings.chatModels.recommendedProfile.warnings.allowFallbacksFalse',
        ),
      })
    }
  }

  // Rule 4: profile-specific caveats.
  if (profile) {
    for (const caveat of profile.caveats) {
      if (caveatApplies(caveat.id, draft)) {
        warnings.push({
          id: `caveat:${caveat.id}`,
          message: caveat.text[locale],
        })
      }
    }
  }

  // Rule 5: fast alias points to a different model.
  const fastAlias = settings.modelAliases?.fast?.trim()
  if (fastAlias && fastAlias !== draft.id) {
    warnings.push({
      id: 'fast-alias-mismatch',
      message: t(
        'settings.chatModels.recommendedProfile.warnings.fastAliasMismatch',
        { modelId: fastAlias },
      ),
    })
  }

  return warnings
}
