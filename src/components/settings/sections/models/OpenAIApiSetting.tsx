import { OpenAIApiMode } from '../../../../core/llm/openAIRequestPolicy'
import { t } from '../../../../i18n'
import { ObsidianDropdown } from '../../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../../common/ObsidianSetting'

export function OpenAIApiSetting({
  value,
  onChange,
  chatOnly = false,
}: {
  value: OpenAIApiMode
  onChange: (value: OpenAIApiMode) => void
  chatOnly?: boolean
}) {
  return (
    <ObsidianSetting
      name={t('settings.chatModels.apiModeField.name')}
      desc={t('settings.chatModels.apiModeField.desc')}
    >
      <ObsidianDropdown
        value={value}
        options={{
          'chat-completions': 'Chat Completions',
          ...(chatOnly ? {} : { responses: 'Responses' }),
        }}
        onChange={(next: string) => onChange(next as OpenAIApiMode)}
      />
    </ObsidianSetting>
  )
}
