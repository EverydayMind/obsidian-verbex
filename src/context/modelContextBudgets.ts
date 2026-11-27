import {
  DEFAULT_CONTEXT_WINDOW,
  computeInputBudget,
  computeOutputBudget,
  resolveContextWindow,
} from '../core/llm/contextWindow'
import { type ModelAlias, resolveChatModelId } from '../core/llm/modelSelection'
import type { VerbexSettings } from '../settings/schema/setting.types'
import type { ChatModel } from '../types/chat-model.types'

import { type ContextBudgets, contextBudgets } from './contextBudgets'
import { effectiveContextBudget } from './effectiveContextBudget'

/**
 * The input budget `I` of a request sent to `model`: the model's window less
 * its output reserve, then the user's mode/limit. An unknown model uses the
 * conservative default window.
 */
export function modelInputBudget(
  settings: VerbexSettings,
  model: ChatModel | undefined,
): number {
  const window = model ? resolveContextWindow(model) : DEFAULT_CONTEXT_WINDOW
  const output = computeOutputBudget(
    window,
    settings.verbex.context.reservedOutputTokens,
  )
  return effectiveContextBudget(settings, computeInputBudget(window, output))
}

export function contextBudgetsFor(
  settings: VerbexSettings,
  model: ChatModel | undefined,
): ContextBudgets {
  return contextBudgets(
    settings.verbex.context,
    modelInputBudget(settings, model),
  )
}

/** Pure lookup of the model the alias resolves to; never builds a client. */
export function contextBudgetsForAlias(
  settings: VerbexSettings,
  alias?: ModelAlias,
): ContextBudgets {
  const { modelId } = resolveChatModelId({ settings, alias })
  return contextBudgetsFor(
    settings,
    settings.chatModels.find((model) => model.id === modelId),
  )
}
