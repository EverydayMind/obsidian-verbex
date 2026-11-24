import { ChatModel } from '../../types/chat-model.types'
import {
  LLMOptions,
  LLMRequestNonStreaming,
  RequestMessage,
  ResponseFormat,
} from '../../types/llm/request'

import { isResponsesModel } from './openAIRequestPolicy'

export function buildSelectionLLMRequest(
  model: ChatModel,
  messages: RequestMessage[],
  responseFormat?: ResponseFormat,
): LLMRequestNonStreaming {
  const reasoningEffort = isResponsesModel(model)
    ? model.selectionReasoningEffort
    : undefined
  return {
    model: model.model,
    messages,
    response_format: responseFormat,
    stream: false,
    ...(reasoningEffort !== undefined
      ? { reasoning_effort: reasoningEffort }
      : {}),
  }
}

export function buildSelectionLLMOptions(
  model: ChatModel,
  signal?: AbortSignal,
): LLMOptions {
  return {
    signal,
    ...(model.selectionTimeoutSec !== undefined
      ? { timeoutMs: model.selectionTimeoutSec * 1000 }
      : {}),
  }
}
