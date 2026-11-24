import { z } from 'zod'

import { PromptLevel } from './prompt-level.types'

export const EXTRA_INSTRUCTIONS_MAX_LENGTH = 4000

export function normalizeExtraInstructions(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const baseChatModelSchema = z.object({
  supportsBrowserImages: z.boolean().optional(),
  providerId: z
    .string({
      error: 'provider ID is required',
    })
    .min(1, 'provider ID is required'),
  id: z
    .string({
      error: 'id is required',
    })
    .min(1, 'id is required'),
  model: z
    .string({
      error: 'model is required',
    })
    .min(1, 'model is required'),
  promptLevel: z.enum(PromptLevel).optional(),
  enable: z.boolean().optional(),
  // Overrides the provider-level tool support setting for this model.
  // undefined means "inherit provider default".
  supportsTools: z.boolean().optional(),
  // Total context window (input + output tokens) the model accepts. Overrides
  // the built-in known-model table. undefined means "auto-detect from the table,
  // else fall back to the conservative default". See core/llm/contextWindow.ts.
  contextWindow: z.number().int().positive().optional(),
  // Timeout in seconds for the first-turn Skill/Workflow selection call.
  // undefined preserves the transport default timeout.
  selectionTimeoutSec: z.number().int().min(1).max(120).optional(),
  // Optional per-model instructions appended to the end of the agent system
  // prompt. Trimmed; blank strings normalize to undefined.
  extraInstructions: z
    .string()
    .trim()
    .max(EXTRA_INSTRUCTIONS_MAX_LENGTH)
    .transform((value) => (value.length > 0 ? value : undefined))
    .optional(),
})

export type OpenRouterProviderPreferences = {
  order?: string[]
  ignore?: string[]
  allowFallbacks?: boolean
}

export type OpenRouterReasoningEffort =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'

export type OpenRouterReasoningPreferences = {
  maxTokens?: number
  effort?: OpenRouterReasoningEffort
  enabled?: boolean
}

export function normalizeOpenRouterProvider(
  value?: OpenRouterProviderPreferences,
): OpenRouterProviderPreferences | undefined {
  if (!value) return undefined
  const order = value.order?.map((s) => s.trim()).filter((s) => s.length > 0)
  const ignore = value.ignore?.map((s) => s.trim()).filter((s) => s.length > 0)
  const normalized: OpenRouterProviderPreferences = {
    ...(order && order.length > 0 ? { order } : {}),
    ...(ignore && ignore.length > 0 ? { ignore } : {}),
    ...(value.allowFallbacks !== undefined
      ? { allowFallbacks: value.allowFallbacks }
      : {}),
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function normalizeOpenRouterReasoning(
  value?: OpenRouterReasoningPreferences,
): OpenRouterReasoningPreferences | undefined {
  if (!value) return undefined
  const normalized: OpenRouterReasoningPreferences = {
    ...(value.maxTokens !== undefined ? { maxTokens: value.maxTokens } : {}),
    ...(value.effort !== undefined ? { effort: value.effort } : {}),
    ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

const reasoningEffortSchema = z.enum([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

const openRouterReasoningEffortSchema = z.enum([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
])

const openRouterProviderSchema = z
  .object({
    order: z.array(z.string()).optional(),
    ignore: z.array(z.string()).optional(),
    allowFallbacks: z.boolean().optional(),
  })
  .transform((value) => normalizeOpenRouterProvider(value))
  .optional()

const openRouterReasoningSchema = z
  .object({
    maxTokens: z.number().int().min(1).optional(),
    effort: openRouterReasoningEffortSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .transform((value) => normalizeOpenRouterReasoning(value))
  .optional()

const openAiCompatibleChatModel = <
  T extends
    | 'openai'
    | 'openrouter'
    | 'ollama'
    | 'lmstudio'
    | 'openai-compatible',
>(
  providerType: T,
) =>
  z.object({
    providerType: z.literal(providerType),
    ...baseChatModelSchema.shape,
    apiMode: z.enum(['chat-completions', 'responses']).optional(),
    // Explicit overrides for official defaults or a documented compatible server.
    openAICompatibility: z
      .object({
        supportsNone: z.boolean().optional(),
        chatCompletionsTools: z
          .enum(['any', 'none-only', 'unsupported'])
          .optional(),
      })
      .optional(),
    // Applied to turns that include function tools on either API.
    // undefined preserves the existing wire contract by omitting the field.
    toolTurnReasoningEffort: reasoningEffortSchema.optional(),
    // Applied to the Skill/Workflow selection call only.
    // undefined preserves the existing wire contract by omitting the field.
    selectionReasoningEffort: reasoningEffortSchema.optional(),
    // OpenRouter-only routing preferences (serialized only for openrouter).
    openRouterProvider: openRouterProviderSchema,
    // OpenRouter-only reasoning object (serialized only for openrouter when
    // the request does not already carry reasoning_effort).
    openRouterReasoning: openRouterReasoningSchema,
  })

export const chatModelSchema = z.discriminatedUnion('providerType', [
  openAiCompatibleChatModel('openai'),
  openAiCompatibleChatModel('ollama'),
  openAiCompatibleChatModel('lmstudio'),
  openAiCompatibleChatModel('openai-compatible'),
  openAiCompatibleChatModel('openrouter'),
  z.object({
    providerType: z.literal('claude'),
    ...baseChatModelSchema.shape,
  }),
  z.object({
    providerType: z.literal('gemini'),
    ...baseChatModelSchema.shape,
  }),
])

export type ChatModel = z.infer<typeof chatModelSchema>
