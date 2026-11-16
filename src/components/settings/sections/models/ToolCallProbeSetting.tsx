import { useState } from 'react'

import {
  ToolCallProbeResult,
  probeToolCall,
} from '../../../../core/llm/toolCallProbe'
import { t } from '../../../../i18n'
import { VerbexSettings } from '../../../../settings/schema/setting.types'
import { ChatModel } from '../../../../types/chat-model.types'
import { LLMProvider } from '../../../../types/provider.types'
import { ObsidianButton } from '../../../common/ObsidianButton'
import { ObsidianSetting } from '../../../common/ObsidianSetting'

export function ToolCallProbeSetting({
  provider,
  model,
  settings,
}: {
  provider?: LLMProvider
  model: ChatModel
  settings: VerbexSettings
}) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ToolCallProbeResult | null>(null)
  const run = async () => {
    if (!provider) return
    setRunning(true)
    setResult(null)
    try {
      setResult(await probeToolCall(provider, model, settings))
    } finally {
      setRunning(false)
    }
  }
  return (
    <ObsidianSetting
      name={t('settings.chatModels.toolProbe.name')}
      desc={
        result
          ? t(`settings.chatModels.toolProbe.${result.kind}`, {
              message: 'message' in result ? result.message : '',
            })
          : undefined
      }
    >
      <ObsidianButton
        text={t('settings.chatModels.toolProbe.name')}
        disabled={running || !provider || !model.model.trim()}
        onClick={() => {
          void run()
        }}
      />
    </ObsidianSetting>
  )
}
