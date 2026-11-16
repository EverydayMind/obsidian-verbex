import { z } from 'zod'

import { PromptLevel } from './prompt-level.types'

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
})

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
    toolTurnReasoningEffort: z
      .enum(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
      .optional(),
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
