// These types are based on the OpenAI Chat Completions API specification.

import { ToolCallRequest } from '../tool-call.types'

import { ResponsesReplayState } from './responses'

export type LLMRequestBase = {
  messages: RequestMessage[]
  model: string

  // Tool calling
  tools?: RequestTool[]
  tool_choice?: RequestToolChoice

  // Structured output. OpenAI-compatible servers (incl. LM Studio / llama.cpp)
  // constrain generation to this schema; providers that don't support it ignore
  // the field. Used to force the skill/workflow selector to emit only valid
  // enum values instead of hallucinated names.
  response_format?: ResponseFormat

  // Reasoning / "thinking" budget for models that expose a chain-of-thought
  // phase. OpenAI-compatible servers (LM Studio / llama.cpp, gemma/qwen-style
  // thinking models) gate the hidden reasoning pass on this; providers that
  // don't support it ignore the field. Set to `'none'` on deterministic triage
  // calls (e.g. relevance eviction) so a tiny model doesn't burn hundreds of
  // reasoning tokens on a one-line answer.
  reasoning_effort?: ReasoningEffort

  // LLM Parameters
  max_tokens?: number // Range: [1, context_length)
  temperature?: number // Range: [0, 2]
  top_p?: number // Range: (0, 1]
  frequency_penalty?: number // Range: [-2, 2]
  presence_penalty?: number // Range: [-2, 2]
}

export type LLMRequestNonStreaming = LLMRequestBase & {
  stream?: false | null
}

export type LLMRequestStreaming = LLMRequestBase & {
  stream: true
}

export type LLMRequest = LLMRequestNonStreaming | LLMRequestStreaming

/**
 * OpenAI-compatible `response_format`. `json_schema` is the one we use to
 * constrain output to a fixed shape (and enum-valued fields); the others are
 * included for completeness.
 */
export type ResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | {
      type: 'json_schema'
      json_schema: {
        name: string
        strict?: boolean
        schema: Record<string, unknown>
      }
    }

/**
 * OpenAI-compatible reasoning budget. `'none'` disables the thinking pass on
 * servers that honor it (LM Studio / llama.cpp gemma/qwen-style models).
 */
export type ReasoningEffort =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

type TextContent = {
  type: 'text'
  text: string
}

type ImageContentPart = {
  type: 'image_url'
  image_url: {
    url: string // URL or base64 encoded image data
  }
}

export type ContentPart = TextContent | ImageContentPart

type RequestSystemMessage = {
  role: 'system'
  content: string
}
type RequestUserMessage = {
  toolImageSource?: string
  disclosure?: ConnectorDisclosure
  role: 'user'
  content: string | ContentPart[]
}

// Reserved for provider-specific metadata attached to assistant messages.
export type RequestProviderMetadata = Record<string, unknown>

type RequestAssistantMessage = {
  disclosure?: ConnectorDisclosure
  role: 'assistant'
  content: string
  tool_calls?: ToolCallRequest[]
  providerMetadata?: RequestProviderMetadata
  responsesReplay?: ResponsesReplayState
}
export type ConnectorDisclosure = {
  connectorId: string
  /** Original connector identities retained when multiple results are combined. */
  sourceConnectorIds?: string[]
  canonicalVaultPaths: string[]
  unattributedFiles: number
}
type RequestToolMessage = {
  queryReplay?: { mode: 'lines' | 'notes'; cursor: string; replayCall: string }
  repeatOriginalText?: string
  images?: import('../../core/llm/toolImages').ToolImage[]
  privateTranscript?: boolean
  disclosure?: ConnectorDisclosure
  role: 'tool'
  tool_call: ToolCallRequest
  content: string // tool response
}
export type RequestMessage = (
  | RequestSystemMessage
  | RequestUserMessage
  | RequestAssistantMessage
  | RequestToolMessage
) & { agentTurnId?: string }

export type LLMOptions = {
  signal?: AbortSignal
  /**
   * Per-request timeout override (ms). When omitted the transport falls back to
   * its default. Used to give long-running map-reduce steps a larger budget
   * than the interactive-chat default.
   */
  timeoutMs?: number
}

export type RequestTool = {
  type: 'function'
  function: FunctionDescription
}

export type RequestToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | {
      type: 'function'
      function: {
        name: string
      }
    }

type FunctionDescription = {
  description?: string
  name: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
    oneOf?: Record<string, unknown>[]
    [key: string]: unknown
  }
}
