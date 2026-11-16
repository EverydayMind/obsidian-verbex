import { PROVIDER_TYPES_INFO } from '../../constants'
import { VerbexSettings } from '../../settings/schema/setting.types'
import { ChatModel } from '../../types/chat-model.types'

export function chatModelSupportsTools({
  settings,
  model,
}: {
  settings: VerbexSettings
  model: ChatModel
}): boolean {
  if (model.supportsTools !== undefined) {
    return model.supportsTools
  }

  const provider = settings.providers.find((p) => p.id === model.providerId)
  if (!provider) {
    return false
  }

  return (
    provider.supportsTools ?? PROVIDER_TYPES_INFO[provider.type].supportTools
  )
}
