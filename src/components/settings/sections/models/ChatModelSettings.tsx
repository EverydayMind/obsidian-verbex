import { App, Notice } from 'obsidian'
import { useState } from 'react'

import { PROVIDER_TYPES_INFO } from '../../../../constants'
import { resolveContextWindow } from '../../../../core/llm/contextWindow'
import {
  OpenAIApiMode,
  resolveOpenAIApiMode,
} from '../../../../core/llm/openAIRequestPolicy'
import { useWebHandsEnabled } from '../../../../hooks/useWebHandsEnabled'
import { t } from '../../../../i18n'
import VerbexPlugin from '../../../../main'
import { ChatModel, chatModelSchema } from '../../../../types/chat-model.types'
import { PromptLevel } from '../../../../types/prompt-level.types'
import { ObsidianButton } from '../../../common/ObsidianButton'
import { ObsidianDropdown } from '../../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../../common/ObsidianTextInput'
import { ReactModal } from '../../../common/ReactModal'

import { OpenAIApiSetting } from './OpenAIApiSetting'
import { ToolCallProbeSetting } from './ToolCallProbeSetting'

type SettingsComponentProps = {
  model: ChatModel
  plugin: VerbexPlugin
  onClose: () => void
}

type ToolTurnReasoningEffortSetting =
  | 'unset'
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

type OpenAiCompatibleChatModel = Extract<
  ChatModel,
  {
    providerType:
      | 'openai'
      | 'openrouter'
      | 'ollama'
      | 'lmstudio'
      | 'openai-compatible'
  }
>

function isOpenAiCompatibleChatModel(
  model: ChatModel,
): model is OpenAiCompatibleChatModel {
  return (
    model.providerType === 'openai' ||
    model.providerType === 'openrouter' ||
    model.providerType === 'ollama' ||
    model.providerType === 'lmstudio' ||
    model.providerType === 'openai-compatible'
  )
}

export class ChatModelSettingsModal extends ReactModal<SettingsComponentProps> {
  constructor(model: ChatModel, app: App, plugin: VerbexPlugin) {
    super({
      app: app,
      Component: ChatModelSettingsComponent,
      props: { model, plugin },
      options: {
        title: t('settings.chatModels.editModal', { id: model.id }),
      },
    })
  }
}

function ChatModelSettingsComponent({
  model,
  plugin,
  onClose,
}: SettingsComponentProps) {
  const webHandsEnabled = useWebHandsEnabled(plugin.app)
  const provider = plugin.settings.providers.find(
    (p) => p.id === model.providerId,
  )
  const providerSupportsTools = provider
    ? (provider.supportsTools ??
      PROVIDER_TYPES_INFO[provider.type].supportTools)
    : false
  const [supportsTools, setSupportsTools] = useState<string>(
    model.supportsTools === undefined
      ? 'inherit'
      : model.supportsTools
        ? 'true'
        : 'false',
  )
  const [browserImages, setBrowserImages] = useState(
    model.supportsBrowserImages === true,
  )
  const isOpenAiCompatible = isOpenAiCompatibleChatModel(model)
  const [apiMode, setApiMode] = useState<OpenAIApiMode>(
    resolveOpenAIApiMode(model),
  )
  const [supportsNone, setSupportsNone] = useState<string>(
    isOpenAiCompatible && model.openAICompatibility?.supportsNone !== undefined
      ? String(model.openAICompatibility.supportsNone)
      : 'inherit',
  )
  const [chatTools, setChatTools] = useState<string>(
    isOpenAiCompatible
      ? (model.openAICompatibility?.chatCompletionsTools ?? 'inherit')
      : 'inherit',
  )
  const [toolTurnReasoningEffort, setToolTurnReasoningEffort] =
    useState<ToolTurnReasoningEffortSetting>(
      isOpenAiCompatible ? (model.toolTurnReasoningEffort ?? 'unset') : 'unset',
    )
  const [contextWindow, setContextWindow] = useState<string>(
    model.contextWindow !== undefined ? String(model.contextWindow) : '',
  )
  const [promptLevel, setPromptLevel] = useState<string>(
    String(model.promptLevel ?? PromptLevel.Default),
  )
  // The value used when the override is left blank (known-model table → default).
  const autoContextWindow = resolveContextWindow({
    ...model,
    contextWindow: undefined,
  })

  const handleSubmit = async () => {
    if (!['inherit', 'true', 'false'].includes(supportsTools)) {
      new Notice(t('settings.chatModels.errorsDetails.supportsToolsInvalid'))
      return
    }
    if (
      isOpenAiCompatible &&
      !['unset', 'none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(
        toolTurnReasoningEffort,
      )
    ) {
      new Notice(
        t('settings.chatModels.errorsDetails.toolTurnReasoningEffortInvalid'),
      )
      return
    }

    const trimmedContextWindow = contextWindow.trim()
    let parsedContextWindow: number | undefined
    if (trimmedContextWindow !== '') {
      const value = Number(trimmedContextWindow)
      if (!Number.isInteger(value) || value <= 0) {
        new Notice(t('settings.chatModels.errorsDetails.contextWindowInvalid'))
        return
      }
      parsedContextWindow = value
    }

    const updatedModel: ChatModel = {
      ...model,
      supportsBrowserImages: browserImages,
      supportsTools:
        supportsTools === 'inherit' ? undefined : supportsTools === 'true',
      contextWindow: parsedContextWindow,
      promptLevel: Number(promptLevel),
      ...(isOpenAiCompatible
        ? {
            apiMode,
            openAICompatibility:
              supportsNone === 'inherit' && chatTools === 'inherit'
                ? undefined
                : {
                    ...(supportsNone === 'inherit'
                      ? {}
                      : { supportsNone: supportsNone === 'true' }),
                    ...(chatTools === 'inherit'
                      ? {}
                      : { chatCompletionsTools: chatTools }),
                  },
            toolTurnReasoningEffort:
              toolTurnReasoningEffort === 'unset'
                ? undefined
                : toolTurnReasoningEffort,
          }
        : {}),
    } as ChatModel

    const validationResult = chatModelSchema.safeParse(updatedModel)
    if (!validationResult.success) {
      new Notice(validationResult.error.issues.map((v) => v.message).join('\n'))
      return
    }

    await plugin.setSettings({
      ...plugin.settings,
      chatModels: plugin.settings.chatModels.map((m) =>
        m.id === model.id ? updatedModel : m,
      ),
    })
    onClose()
  }

  const providerStatusText = providerSupportsTools
    ? t('settings.common.enabled')
    : t('settings.common.disabled')

  return (
    <>
      {webHandsEnabled && (
        <ObsidianSetting
          name={t('settings.chatModels.browserImagesField.name')}
          desc={t('settings.chatModels.browserImagesField.desc')}
        >
          <ObsidianDropdown
            value={String(browserImages)}
            options={{
              false: t('settings.common.disabled'),
              true: t('settings.common.enabled'),
            }}
            onChange={(value: string) => setBrowserImages(value === 'true')}
          />
        </ObsidianSetting>
      )}
      <ObsidianSetting
        name={t('settings.chatModels.supportsToolsField.name')}
        desc={t('settings.chatModels.supportsToolsField.desc', {
          status: providerStatusText,
        })}
      >
        <ObsidianDropdown
          value={supportsTools}
          options={{
            inherit: t('settings.common.inherit', {
              status: providerStatusText,
            }),
            true: t('settings.common.enabled'),
            false: t('settings.common.disabled'),
          }}
          onChange={(value: string) => setSupportsTools(value)}
        />
      </ObsidianSetting>

      <ToolCallProbeSetting
        provider={provider}
        model={isOpenAiCompatible ? { ...model, apiMode } : model}
        settings={plugin.settings}
      />

      {isOpenAiCompatible && (
        <OpenAIApiSetting
          value={apiMode}
          onChange={setApiMode}
          chatOnly={model.providerType === 'openrouter'}
        />
      )}
      {isOpenAiCompatible && (
        <ObsidianSetting
          name={t('settings.chatModels.toolTurnReasoningEffortField.name')}
          desc={t('settings.chatModels.toolTurnReasoningEffortField.desc')}
        >
          <ObsidianDropdown
            value={toolTurnReasoningEffort}
            options={{
              unset: t(
                'settings.chatModels.toolTurnReasoningEffortOptions.unset',
              ),
              none: t(
                'settings.chatModels.toolTurnReasoningEffortOptions.none',
              ),
              low: t('settings.chatModels.toolTurnReasoningEffortOptions.low'),
              medium: t(
                'settings.chatModels.toolTurnReasoningEffortOptions.medium',
              ),
              high: t(
                'settings.chatModels.toolTurnReasoningEffortOptions.high',
              ),
              xhigh: 'xhigh',
              max: 'max',
            }}
            onChange={(value: string) =>
              setToolTurnReasoningEffort(
                value as ToolTurnReasoningEffortSetting,
              )
            }
          />
        </ObsidianSetting>
      )}

      {isOpenAiCompatible && (
        <>
          <ObsidianSetting
            name={t('settings.chatModels.supportsNoneField.name')}
            desc={t('settings.chatModels.compatibilityOverrideDesc')}
          >
            <ObsidianDropdown
              value={supportsNone}
              options={{
                inherit: t('settings.chatModels.compatibilityAuto'),
                true: t('settings.common.enabled'),
                false: t('settings.common.disabled'),
              }}
              onChange={setSupportsNone}
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t('settings.chatModels.chatToolsField.name')}
            desc={t('settings.chatModels.compatibilityOverrideDesc')}
          >
            <ObsidianDropdown
              value={chatTools}
              options={{
                inherit: t('settings.chatModels.compatibilityAuto'),
                any: t('settings.chatModels.chatToolsOptions.any'),
                'none-only': t('settings.chatModels.chatToolsOptions.noneOnly'),
                unsupported: t(
                  'settings.chatModels.chatToolsOptions.unsupported',
                ),
              }}
              onChange={setChatTools}
            />
          </ObsidianSetting>
        </>
      )}

      <ObsidianSetting
        name={t('settings.chatModels.contextWindowField.name')}
        desc={t('settings.chatModels.contextWindowField.desc', {
          autoVal: autoContextWindow.toLocaleString(),
        })}
      >
        <ObsidianTextInput
          value={contextWindow}
          type="number"
          placeholder={`${t('settings.context.currentNoteModeOptions.auto')} (${autoContextWindow})`}
          onChange={(value: string) => setContextWindow(value)}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.chatModels.promptLevelField.name')}
        desc={t('settings.chatModels.promptLevelField.desc')}
      >
        <ObsidianDropdown
          value={promptLevel}
          options={{
            [PromptLevel.Default]: t(
              'settings.chatModels.promptLevelOptions.default',
            ),
            [PromptLevel.Simple]: t(
              'settings.chatModels.promptLevelOptions.simple',
            ),
          }}
          onChange={(value: string) => setPromptLevel(value)}
        />
      </ObsidianSetting>

      <ObsidianSetting>
        <ObsidianButton
          text={t('settings.common.save')}
          onClick={(...args) => {
            void handleSubmit(...args)
          }}
          cta
        />
        <ObsidianButton text={t('settings.common.cancel')} onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}

export function hasChatModelSettings(_model: ChatModel): boolean {
  return true
}
