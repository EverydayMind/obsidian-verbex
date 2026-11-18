import { PROVIDER_TYPES_INFO } from '../../constants'
import { LLMProvider } from '../../types/provider.types'

export type ModelDiscoveryReadiness =
  | 'provider_missing'
  | 'credentials_missing'
  | 'base_url_missing'
  | 'ready'

export function providerDiscoveryReadiness(
  provider: LLMProvider,
): 'credentials_missing' | 'base_url_missing' | 'ready' {
  const info = PROVIDER_TYPES_INFO[provider.type]
  if (info.requireApiKey && !provider.apiKey?.trim())
    return 'credentials_missing'
  if (info.requireBaseUrl && !provider.baseUrl?.trim())
    return 'base_url_missing'
  return 'ready'
}

export function resolveModelDiscoveryReadiness(
  provider: LLMProvider | undefined,
): ModelDiscoveryReadiness {
  if (!provider) return 'provider_missing'
  return providerDiscoveryReadiness(provider)
}

export function shouldOfferAddChatModelsAfterEdit(
  provider: LLMProvider,
  chatModelsCount: number,
): boolean {
  return (
    chatModelsCount === 0 && providerDiscoveryReadiness(provider) === 'ready'
  )
}

export function firstReadyProvider(providers: readonly LLMProvider[]) {
  return providers.find(
    (provider) => providerDiscoveryReadiness(provider) === 'ready',
  )
}
