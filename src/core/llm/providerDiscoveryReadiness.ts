import { PROVIDER_TYPES_INFO } from '../../constants'
import { LLMProvider } from '../../types/provider.types'

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

export function firstReadyProvider(providers: readonly LLMProvider[]) {
  return providers.find(
    (provider) => providerDiscoveryReadiness(provider) === 'ready',
  )
}
