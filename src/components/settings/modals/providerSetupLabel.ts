import { providerDiscoveryReadiness } from '../../../core/llm/providerDiscoveryReadiness'
import { t } from '../../../i18n'
import type { LLMProvider } from '../../../types/provider.types'

/**
 * Label for the action that opens a provider's edit dialog: names the API key
 * when that is what is missing, otherwise the generic provider setup wording.
 */
export function providerSetupLabel(provider: LLMProvider): string {
  return providerDiscoveryReadiness(provider) === 'credentials_missing'
    ? t('settings.chatModels.discovery.enterApiKey', { provider: provider.id })
    : t('settings.chatModels.discovery.setupProvider')
}
