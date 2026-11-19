import type { VerbexSettings } from '../../settings/schema/setting.types'
import type { LLMProvider } from '../../types/provider.types'

import type { ChatModelReadiness } from './modelReadiness'
import {
  firstReadyProvider,
  providerDiscoveryReadiness,
} from './providerDiscoveryReadiness'

export type ReadinessAction =
  | { kind: 'setupProvider'; provider: LLMProvider }
  | { kind: 'addProvider' }
  | { kind: 'addModel' }

/**
 * What a "chat model is not usable" message should offer first. When the
 * cause is the selected model's provider (no key / no base URL), that
 * provider's edit dialog comes first; "add model" is only for the case where
 * a ready provider exists but has no usable chat model.
 */
export function chooseReadinessAction(
  settings: VerbexSettings,
  readiness: ChatModelReadiness,
): ReadinessAction {
  if (
    readiness.status === 'credentials_missing' ||
    readiness.status === 'base_url_missing'
  ) {
    return { kind: 'setupProvider', provider: readiness.provider }
  }
  if (firstReadyProvider(settings.providers)) return { kind: 'addModel' }
  const unready = settings.providers.find(
    (provider) => providerDiscoveryReadiness(provider) !== 'ready',
  )
  return unready
    ? { kind: 'setupProvider', provider: unready }
    : { kind: 'addProvider' }
}

/** The provider of the currently selected chat model, if it still exists. */
export function selectedChatProvider(
  settings: VerbexSettings,
): LLMProvider | undefined {
  const model = settings.chatModels.find((m) => m.id === settings.chatModelId)
  return settings.providers.find((p) => p.id === model?.providerId)
}
