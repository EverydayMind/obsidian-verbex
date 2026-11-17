import { z } from 'zod'

export const baseLlmProviderSchema = z.object({
  id: z.string().min(1, 'id is required'),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  // Keychain secret name; the value is not written to data.json.
  apiKeySecret: z.string().optional(),
  // Absolute path to an additional trusted CA certificate (PEM). Needed for
  // streaming requests behind TLS-inspecting proxies / internal CAs, since
  // Node's https ignores the OS certificate store.
  tlsCaCertPath: z.string().optional(),
  // Disables TLS certificate verification. Last resort; prefer tlsCaCertPath.
  tlsSkipVerify: z.boolean().optional(),
  // Whether chat requests for this provider may include OpenAI-style tools.
  // Some local OpenAI-compatible servers/models fail while rendering prompts
  // when tools are present, so this can be disabled per provider.
  supportsTools: z.boolean().optional(),
  additionalSettings: z.record(z.string(), z.string()).optional(),
})

/**
 * Verbex supports multiple LLM providers behind the BaseLLMProvider
 * abstraction. OpenAI is the default; the remaining
 * providers reuse OpenAI-compatible wire formats (openai / ollama / lmstudio
 * / openai-compatible / openrouter) or carry their own (claude / gemini).
 *
 * When adding or removing a provider type, update these files together:
 * - src/constants.ts (PROVIDER_TYPES_INFO, DEFAULT_PROVIDERS)
 * - src/types/chat-model.types.ts
 * - src/types/embedding-model.types.ts
 * - src/core/llm/manager.ts (getProviderClient switch)
 */
export const PROVIDER_TYPES = [
  'openai',
  'openrouter',
  'claude',
  'gemini',
  'ollama',
  'lmstudio',
  'openai-compatible',
] as const

const providerVariant = <T extends (typeof PROVIDER_TYPES)[number]>(type: T) =>
  z.object({
    type: z.literal(type),
    ...baseLlmProviderSchema.shape,
  })

export const llmProviderSchema = z.discriminatedUnion('type', [
  providerVariant('openai'),
  providerVariant('openrouter'),
  providerVariant('claude'),
  providerVariant('gemini'),
  providerVariant('ollama'),
  providerVariant('lmstudio'),
  providerVariant('openai-compatible'),
])

export type LLMProvider = z.infer<typeof llmProviderSchema>
export type LLMProviderType = LLMProvider['type']
