import { RECOMMENDED_MODELS_FOR_CHAT } from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import { t } from '../../../i18n'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextArea } from '../../common/ObsidianTextArea'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'

// A stale/unset selection is never silently coerced to whatever option the
// native <select> happens to render first — it gets an explicit sentinel
// entry instead (§4.5: "빈 options에 빈 문자열을 단순히 setValue하는 방식에
// 의존하지 않는다"), and choosing it writes back ''.
const UNSET_MODEL_OPTION = '__unset__'

function buildModelOptions(
  chatModels: { id: string; enable?: boolean | null }[],
  currentId: string,
  recommended: readonly string[],
): Record<string, string> {
  const options = Object.fromEntries(
    chatModels
      .filter(({ enable }) => enable ?? true)
      .map((chatModel) => [
        chatModel.id,
        `${chatModel.id}${recommended.includes(chatModel.id) ? ` (${t('settings.common.recommended')})` : ''}`,
      ]),
  )
  if (!currentId || !(currentId in options)) {
    options[UNSET_MODEL_OPTION] = t('settings.chat.modelUnsetOption')
  }
  return options
}

/** The "Chat model" row. Shown on both the Get started and Chat tabs. */
export function ChatModelSetting() {
  const { settings, setSettings } = useSettings()
  const chatModelOptions = buildModelOptions(
    settings.chatModels,
    settings.chatModelId,
    RECOMMENDED_MODELS_FOR_CHAT,
  )

  return (
    <ObsidianSetting
      name={t('settings.chat.chatModel.name')}
      desc={t('settings.chat.chatModel.desc')}
    >
      <ObsidianDropdown
        value={
          settings.chatModelId in chatModelOptions
            ? settings.chatModelId
            : UNSET_MODEL_OPTION
        }
        options={chatModelOptions}
        onChange={(value) => {
          void setSettings({
            ...settings,
            chatModelId: value === UNSET_MODEL_OPTION ? '' : value,
          })
        }}
      />
    </ObsidianSetting>
  )
}

export function ChatSection() {
  const { settings, setSettings } = useSettings()

  return (
    <div className="verbex-settings-section">
      <h2 className="verbex-settings-header">{t('settings.chat.title')}</h2>

      <ChatModelSetting />

      <ObsidianSetting
        name={t('settings.chat.includeCurrentFile.name')}
        desc={t('settings.chat.includeCurrentFile.desc')}
      >
        <ObsidianToggle
          value={settings.chatOptions.includeCurrentFileContent}
          onChange={(value) => {
            void setSettings({
              ...settings,
              chatOptions: {
                ...settings.chatOptions,
                includeCurrentFileContent: value,
              },
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.chat.systemPrompt.name')}
        desc={t('settings.chat.systemPrompt.desc')}
        className="verbex-settings-textarea-header"
      />

      <ObsidianSetting className="verbex-settings-textarea">
        <ObsidianTextArea
          value={settings.systemPrompt}
          onChange={(value: string) => {
            void setSettings({
              ...settings,
              systemPrompt: value,
            })
          }}
        />
      </ObsidianSetting>
    </div>
  )
}

export function ChatAdvancedSettings() {
  const { settings, setSettings } = useSettings()

  return (
    <>
      <ObsidianSetting
        name={t('settings.chat.maxAutoIterations.name')}
        desc={t('settings.chat.maxAutoIterations.desc')}
      >
        <ObsidianTextInput
          value={settings.chatOptions.maxAutoIterations.toString()}
          onChange={(value) => {
            const parsedValue = parseInt(value)
            if (isNaN(parsedValue) || parsedValue < 1) {
              return
            }
            void setSettings({
              ...settings,
              chatOptions: {
                ...settings.chatOptions,
                maxAutoIterations: parsedValue,
              },
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.chat.nextButtonMessage.name')}
        desc={t('settings.chat.nextButtonMessage.desc')}
      >
        <ObsidianTextInput
          value={settings.chatOptions.nextButtonMessage}
          onChange={(value) => {
            void setSettings({
              ...settings,
              chatOptions: {
                ...settings.chatOptions,
                nextButtonMessage: value,
              },
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.chat.minEvidenceReads.name')}
        desc={t('settings.chat.minEvidenceReads.desc')}
      >
        <ObsidianTextInput
          value={settings.chatOptions.minEvidenceReads.toString()}
          onChange={(value) => {
            const parsedValue = Number.parseInt(value, 10)
            if (
              Number.isNaN(parsedValue) ||
              parsedValue < 0 ||
              parsedValue > 20
            ) {
              return
            }
            void setSettings({
              ...settings,
              chatOptions: {
                ...settings.chatOptions,
                minEvidenceReads: parsedValue,
              },
            })
          }}
        />
      </ObsidianSetting>
    </>
  )
}
