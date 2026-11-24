import type { DiagnosticFormFields } from '../../../../core/llm/modelDiagnostics'
import {
  ModelProfile,
  RecommendedField,
} from '../../../../core/llm/modelProfiles'
import {
  OpenAIApiMode,
  resolveOpenAIApiMode,
} from '../../../../core/llm/openAIRequestPolicy'
import { Locale } from '../../../../i18n'
import {
  ChatModel,
  EXTRA_INSTRUCTIONS_MAX_LENGTH,
  OpenRouterReasoningEffort,
  normalizeExtraInstructions,
  normalizeOpenRouterProvider,
  normalizeOpenRouterReasoning,
} from '../../../../types/chat-model.types'
import { PromptLevel } from '../../../../types/prompt-level.types'

export type ToolTurnReasoningEffortSetting =
  | 'unset'
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export type TriStateSetting = 'unset' | 'true' | 'false'

export type OpenRouterReasoningEffortSetting =
  | 'unset'
  | OpenRouterReasoningEffort

export const REASONING_EFFORT_VALUES: readonly ToolTurnReasoningEffortSetting[] =
  ['unset', 'none', 'low', 'medium', 'high', 'xhigh', 'max']

export const OPENROUTER_REASONING_EFFORT_VALUES: readonly OpenRouterReasoningEffortSetting[] =
  ['unset', 'minimal', 'low', 'medium', 'high', 'xhigh']

export type OpenAiCompatibleChatModel = Extract<
  ChatModel,
  {
    providerType:
      | 'openai'
      | 'openrouter'
      | 'ollama'
      | 'lmstudio'
      | 'openai-compatible'
  }
>

export type ChatModelSettingsFormState = {
  supportsTools: string
  browserImages: boolean
  apiMode: OpenAIApiMode
  supportsNone: string
  chatTools: string
  toolTurnReasoningEffort: ToolTurnReasoningEffortSetting
  selectionReasoningEffort: ToolTurnReasoningEffortSetting
  openRouterOrder: string
  openRouterIgnore: string
  openRouterAllowFallbacks: TriStateSetting
  openRouterReasoningMaxTokens: string
  openRouterReasoningEffort: OpenRouterReasoningEffortSetting
  openRouterReasoningEnabled: TriStateSetting
  selectionTimeoutSec: string
  contextWindow: string
  promptLevel: string
  extraInstructions: string
}

export function isOpenAiCompatibleChatModel(
  model: ChatModel,
): model is OpenAiCompatibleChatModel {
  return (
    model.providerType === 'openai' ||
    model.providerType === 'openrouter' ||
    model.providerType === 'ollama' ||
    model.providerType === 'lmstudio' ||
    model.providerType === 'openai-compatible'
  )
}

export function parseCommaList(raw: string): string[] | undefined {
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return items.length > 0 ? items : undefined
}

export function createInitialFormState(
  model: ChatModel,
): ChatModelSettingsFormState {
  const isOpenAiCompatible = isOpenAiCompatibleChatModel(model)
  const isOpenRouter = model.providerType === 'openrouter'
  return {
    supportsTools:
      model.supportsTools === undefined
        ? 'inherit'
        : model.supportsTools
          ? 'true'
          : 'false',
    browserImages: model.supportsBrowserImages === true,
    apiMode: resolveOpenAIApiMode(model),
    supportsNone:
      isOpenAiCompatible &&
      model.openAICompatibility?.supportsNone !== undefined
        ? String(model.openAICompatibility.supportsNone)
        : 'inherit',
    chatTools: isOpenAiCompatible
      ? (model.openAICompatibility?.chatCompletionsTools ?? 'inherit')
      : 'inherit',
    toolTurnReasoningEffort: isOpenAiCompatible
      ? (model.toolTurnReasoningEffort ?? 'unset')
      : 'unset',
    selectionReasoningEffort: isOpenAiCompatible
      ? (model.selectionReasoningEffort ?? 'unset')
      : 'unset',
    openRouterOrder: isOpenRouter
      ? (model.openRouterProvider?.order?.join(', ') ?? '')
      : '',
    openRouterIgnore: isOpenRouter
      ? (model.openRouterProvider?.ignore?.join(', ') ?? '')
      : '',
    openRouterAllowFallbacks:
      isOpenRouter && model.openRouterProvider?.allowFallbacks !== undefined
        ? model.openRouterProvider.allowFallbacks
          ? 'true'
          : 'false'
        : 'unset',
    openRouterReasoningMaxTokens:
      isOpenRouter && model.openRouterReasoning?.maxTokens !== undefined
        ? String(model.openRouterReasoning.maxTokens)
        : '',
    openRouterReasoningEffort: isOpenRouter
      ? (model.openRouterReasoning?.effort ?? 'unset')
      : 'unset',
    openRouterReasoningEnabled:
      isOpenRouter && model.openRouterReasoning?.enabled !== undefined
        ? model.openRouterReasoning.enabled
          ? 'true'
          : 'false'
        : 'unset',
    selectionTimeoutSec:
      model.selectionTimeoutSec !== undefined
        ? String(model.selectionTimeoutSec)
        : '',
    contextWindow:
      model.contextWindow !== undefined ? String(model.contextWindow) : '',
    promptLevel: String(model.promptLevel ?? PromptLevel.Default),
    extraInstructions: model.extraInstructions ?? '',
  }
}

function parseIntInRange(
  raw: string,
  min: number,
  max?: number,
): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < min) return undefined
  if (max !== undefined && value > max) return undefined
  return value
}

export function buildDraftChatModel(
  model: ChatModel,
  form: ChatModelSettingsFormState,
): ChatModel {
  const isOpenAiCompatible = isOpenAiCompatibleChatModel(model)
  const isOpenRouter = model.providerType === 'openrouter'
  const parsedSelectionTimeoutSec = parseIntInRange(
    form.selectionTimeoutSec,
    1,
    120,
  )
  const parsedContextWindow = parseIntInRange(form.contextWindow, 1)
  const parsedOpenRouterReasoningMaxTokens = isOpenRouter
    ? parseIntInRange(form.openRouterReasoningMaxTokens, 1)
    : undefined
  const normalizedExtraInstructions = normalizeExtraInstructions(
    form.extraInstructions,
  )

  return {
    ...model,
    supportsBrowserImages: form.browserImages,
    supportsTools:
      form.supportsTools === 'inherit'
        ? undefined
        : form.supportsTools === 'true',
    contextWindow: parsedContextWindow,
    selectionTimeoutSec: parsedSelectionTimeoutSec,
    promptLevel: Number(form.promptLevel),
    extraInstructions: normalizedExtraInstructions,
    ...(isOpenAiCompatible
      ? {
          apiMode: form.apiMode,
          openAICompatibility:
            form.supportsNone === 'inherit' && form.chatTools === 'inherit'
              ? undefined
              : {
                  ...(form.supportsNone === 'inherit'
                    ? {}
                    : { supportsNone: form.supportsNone === 'true' }),
                  ...(form.chatTools === 'inherit'
                    ? {}
                    : { chatCompletionsTools: form.chatTools }),
                },
          toolTurnReasoningEffort:
            form.toolTurnReasoningEffort === 'unset'
              ? undefined
              : form.toolTurnReasoningEffort,
          selectionReasoningEffort:
            form.selectionReasoningEffort === 'unset'
              ? undefined
              : form.selectionReasoningEffort,
          ...(isOpenRouter
            ? {
                openRouterProvider: normalizeOpenRouterProvider({
                  order: parseCommaList(form.openRouterOrder),
                  ignore: parseCommaList(form.openRouterIgnore),
                  allowFallbacks:
                    form.openRouterAllowFallbacks === 'unset'
                      ? undefined
                      : form.openRouterAllowFallbacks === 'true',
                }),
                openRouterReasoning: normalizeOpenRouterReasoning({
                  maxTokens: parsedOpenRouterReasoningMaxTokens,
                  effort:
                    form.openRouterReasoningEffort === 'unset'
                      ? undefined
                      : form.openRouterReasoningEffort,
                  enabled:
                    form.openRouterReasoningEnabled === 'unset'
                      ? undefined
                      : form.openRouterReasoningEnabled === 'true',
                }),
              }
            : {}),
        }
      : {}),
  } as ChatModel
}

function isUnsetField<T>(
  field: RecommendedField<T>,
): field is { readonly unset: true } {
  return 'unset' in field && field.unset
}

export type ApplyRecommendedResult = {
  nextForm: ChatModelSettingsFormState
  extraInstructionsOverflow: boolean
}

export function applyRecommendedFieldsToForm(
  form: ChatModelSettingsFormState,
  rec: DiagnosticFormFields,
  locale: Locale,
): ApplyRecommendedResult {
  const next: ChatModelSettingsFormState = { ...form }
  let extraInstructionsOverflow = false

  if (rec.supportsTools) {
    next.supportsTools = isUnsetField(rec.supportsTools)
      ? 'inherit'
      : rec.supportsTools.value
        ? 'true'
        : 'false'
  }
  if (rec.toolTurnReasoningEffort) {
    next.toolTurnReasoningEffort = isUnsetField(rec.toolTurnReasoningEffort)
      ? 'unset'
      : rec.toolTurnReasoningEffort.value
  }
  if (rec.selectionReasoningEffort) {
    next.selectionReasoningEffort = isUnsetField(rec.selectionReasoningEffort)
      ? 'unset'
      : rec.selectionReasoningEffort.value
  }
  if (rec.selectionTimeoutSec) {
    next.selectionTimeoutSec = isUnsetField(rec.selectionTimeoutSec)
      ? ''
      : String(rec.selectionTimeoutSec.value)
  }
  if (rec.openRouterProviderOrder) {
    next.openRouterOrder = isUnsetField(rec.openRouterProviderOrder)
      ? ''
      : rec.openRouterProviderOrder.value.join(', ')
  }
  if (rec.openRouterAllowFallbacks) {
    next.openRouterAllowFallbacks = isUnsetField(rec.openRouterAllowFallbacks)
      ? 'unset'
      : rec.openRouterAllowFallbacks.value
        ? 'true'
        : 'false'
  }
  if (rec.openRouterReasoningMaxTokens) {
    next.openRouterReasoningMaxTokens = isUnsetField(
      rec.openRouterReasoningMaxTokens,
    )
      ? ''
      : String(rec.openRouterReasoningMaxTokens.value)
  }
  if (rec.contextWindow) {
    if (isUnsetField(rec.contextWindow)) {
      next.contextWindow = ''
    } else {
      const currentWindow = parseIntInRange(form.contextWindow, 1)
      if (
        currentWindow === undefined ||
        currentWindow < rec.contextWindow.value
      ) {
        next.contextWindow = String(rec.contextWindow.value)
      }
    }
  }
  if (rec.extraInstructions) {
    if (isUnsetField(rec.extraInstructions)) {
      next.extraInstructions = ''
    } else {
      const recText = rec.extraInstructions.value[locale].trim()
      const currentTrimmed = form.extraInstructions.trim()
      if (currentTrimmed === '') {
        next.extraInstructions = recText
      } else if (!form.extraInstructions.includes(recText)) {
        const combined = `${currentTrimmed}\n\n${recText}`
        if (combined.length > EXTRA_INSTRUCTIONS_MAX_LENGTH) {
          extraInstructionsOverflow = true
        } else {
          next.extraInstructions = combined
        }
      }
    }
  }

  return { nextForm: next, extraInstructionsOverflow }
}

export function applyRecommendedProfileToForm(
  form: ChatModelSettingsFormState,
  profile: ModelProfile,
  locale: Locale,
): ApplyRecommendedResult {
  return applyRecommendedFieldsToForm(form, profile.recommended, locale)
}
