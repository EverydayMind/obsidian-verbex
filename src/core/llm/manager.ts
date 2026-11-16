import { VerbexSettings } from '../../settings/schema/setting.types'
import { ChatModel } from '../../types/chat-model.types'
import { LLMProvider } from '../../types/provider.types'

import { BaseLLMProvider, ConnectionTestResult } from './base'
import { ClaudeProvider } from './claudeProvider'
import { LLMModelNotFoundException } from './exception'
import { OpenAICompatibleProvider } from './openAICompatibleProvider'

export function getProviderClientFromProvider(
  provider: LLMProvider,
): BaseLLMProvider<LLMProvider> {
  switch (provider.type) {
    case 'openai':
    case 'gemini':
    case 'ollama':
    case 'lmstudio':
    case 'openai-compatible':
    case 'openrouter':
      // Gemini speaks the OpenAI wire format via Google's OpenAI-compatible
      // endpoint, so it shares the OpenAI-compatible client.
      return new OpenAICompatibleProvider(provider)
    case 'claude':
      return new ClaudeProvider(provider)
  }
}

export function getProviderClient({
  providerId,
  settings,
}: {
  providerId: string
  settings: VerbexSettings
  setSettings?: (newSettings: VerbexSettings) => void | Promise<void>
}): BaseLLMProvider<LLMProvider> {
  const provider = settings.providers.find((p) => p.id === providerId)
  if (!provider) {
    throw new Error(`Provider ${providerId} not found`)
  }

  return getProviderClientFromProvider(provider)
}

/**
 * Run a provider's connection test from settings. Builds an ephemeral client
 * from the (possibly unsaved) provider config so users can validate before
 * saving.
 */
export async function testProviderConnection(
  provider: LLMProvider,
  model?: ChatModel,
): Promise<ConnectionTestResult> {
  try {
    return await getProviderClientFromProvider(provider).testConnection(model)
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function getChatModelClient({
  modelId,
  settings,
}: {
  modelId: string
  settings: VerbexSettings
  setSettings?: (newSettings: VerbexSettings) => void | Promise<void>
}): {
  providerClient: BaseLLMProvider<LLMProvider>
  model: ChatModel
} {
  const chatModel = settings.chatModels.find((model) => model.id === modelId)
  if (!chatModel) {
    throw new LLMModelNotFoundException(`Chat model ${modelId} not found`)
  }

  const providerClient = getProviderClient({
    providerId: chatModel.providerId,
    settings,
  })

  return {
    providerClient,
    model: chatModel,
  }
}
