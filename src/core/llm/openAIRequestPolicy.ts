import { ChatModel } from '../../types/chat-model.types'
import { LLMRequestBase, ReasoningEffort } from '../../types/llm/request'

import { OpenAIConfigurationError } from './responsesErrors'

export type OpenAIApiMode = 'chat-completions' | 'responses'
export type OpenAICompatibility = {
  supportsNone: boolean
  chatCompletionsTools: 'any' | 'none-only' | 'unsupported'
}

/** Apply official defaults only to the official OpenAI provider. */
const KNOWN_COMPATIBILITY: Record<string, OpenAICompatibility> = {
  'gpt-6-luna': { supportsNone: true, chatCompletionsTools: 'none-only' },
  'gpt-6-sol': { supportsNone: true, chatCompletionsTools: 'none-only' },
  'gpt-6-astra': { supportsNone: false, chatCompletionsTools: 'unsupported' },
  'gpt-6.1-sol': { supportsNone: false, chatCompletionsTools: 'unsupported' },
}

export function resolveOpenAIApiMode(model: ChatModel): OpenAIApiMode {
  return 'apiMode' in model
    ? (model.apiMode ?? 'chat-completions')
    : 'chat-completions'
}

export function resolveOpenAICompatibility(
  model: ChatModel,
): OpenAICompatibility | undefined {
  if (!isResponsesModel(model)) return undefined
  const known =
    model.providerType === 'openai'
      ? KNOWN_COMPATIBILITY[model.model]
      : undefined
  const override = model.openAICompatibility
  if (!known && !override) return undefined
  return {
    supportsNone: true,
    chatCompletionsTools: 'any',
    ...known,
    ...override,
  }
}

export function isResponsesModel(model: ChatModel): model is Extract<
  ChatModel,
  {
    providerType:
      | 'openai'
      | 'openrouter'
      | 'ollama'
      | 'lmstudio'
      | 'openai-compatible'
  }
> {
  return [
    'openai',
    'openrouter',
    'ollama',
    'lmstudio',
    'openai-compatible',
  ].includes(model.providerType)
}

export function validateOpenAIToolConfiguration(
  model: ChatModel,
  effort?: ReasoningEffort,
): void {
  const compatibility = resolveOpenAICompatibility(model)
  if (!compatibility) return
  if (effort === 'none' && !compatibility.supportsNone) {
    throw new OpenAIConfigurationError(
      `${model.model} does not support reasoning effort none. Select low or another supported effort.`,
    )
  }
  if (resolveOpenAIApiMode(model) !== 'chat-completions') return
  if (compatibility.chatCompletionsTools === 'unsupported') {
    throw new OpenAIConfigurationError(
      `${model.model} requires Responses API for function tools. Change this model's API mode in settings.`,
    )
  }
  if (compatibility.chatCompletionsTools === 'none-only' && effort !== 'none') {
    throw new OpenAIConfigurationError(
      `${model.model} requires explicit reasoning effort none for Chat Completions function tools. Select Responses API to keep reasoning.`,
    )
  }
}

export function resolveOpenAIRequest(
  model: ChatModel,
  request: LLMRequestBase,
): LLMRequestBase {
  const compatibility = resolveOpenAICompatibility(model)
  if (request.model !== model.model) {
    throw new OpenAIConfigurationError(
      'Request model does not match the selected model configuration.',
    )
  }
  if (request.tools?.length)
    validateOpenAIToolConfiguration(model, request.reasoning_effort)
  if (
    request.reasoning_effort === 'none' &&
    compatibility?.supportsNone === false
  ) {
    throw new OpenAIConfigurationError(
      `${model.model} does not support reasoning effort none. Select a supported model for this request.`,
    )
  }
  // Unset reasoning defaults to medium on the documented GPT-6 models.
  const removeSampling =
    model.providerType === 'openai' &&
    KNOWN_COMPATIBILITY[model.model] &&
    request.reasoning_effort !== 'none'
  if (!removeSampling) return request
  const { temperature: _temperature, top_p: _topP, ...rest } = request
  return rest
}

export function assertAgentModelApi(
  model: ChatModel,
  toolsEnabled: boolean,
): void {
  if (toolsEnabled)
    validateOpenAIToolConfiguration(
      model,
      isResponsesModel(model) ? model.toolTurnReasoningEffort : undefined,
    )
}
