import { App, Notice } from 'obsidian'
import { useState } from 'react'

import { PROVIDER_TYPES_INFO } from '../../../../constants'
import {
  computeOutputBudget,
  resolveContextWindow,
} from '../../../../core/llm/contextWindow'
import type { DiagnosticFormFields } from '../../../../core/llm/modelDiagnostics'
import { lookupModelProfile } from '../../../../core/llm/modelProfiles'
import { useWebHandsEnabled } from '../../../../hooks/useWebHandsEnabled'
import { getCurrentLocale, t } from '../../../../i18n'
import VerbexPlugin from '../../../../main'
import {
  ChatModel,
  EXTRA_INSTRUCTIONS_MAX_LENGTH,
  chatModelSchema,
  normalizeExtraInstructions,
} from '../../../../types/chat-model.types'
import { PromptLevel } from '../../../../types/prompt-level.types'
import { ObsidianButton } from '../../../common/ObsidianButton'
import { ObsidianDropdown } from '../../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../../common/ObsidianSetting'
import { ObsidianTextArea } from '../../../common/ObsidianTextArea'
import { ObsidianTextInput } from '../../../common/ObsidianTextInput'
import { ReactModal } from '../../../common/ReactModal'

import {
  ChatModelSettingsFormState,
  OPENROUTER_REASONING_EFFORT_VALUES,
  OpenRouterReasoningEffortSetting,
  REASONING_EFFORT_VALUES,
  ToolTurnReasoningEffortSetting,
  TriStateSetting,
  applyRecommendedFieldsToForm,
  applyRecommendedProfileToForm,
  buildDraftChatModel,
  createInitialFormState,
  isOpenAiCompatibleChatModel,
} from './chatModelSettingsForm'
import { evaluateChatModelWarnings } from './chatModelWarnings'
import { ModelDiagnosticsPanel } from './ModelDiagnosticsPanel'
import { ModelRecommendedSettingsCard } from './ModelRecommendedSettingsCard'
import { OpenAIApiSetting } from './OpenAIApiSetting'
import { ToolCallProbeSetting } from './ToolCallProbeSetting'

type SettingsComponentProps = {
  model: ChatModel
  plugin: VerbexPlugin
  onClose: () => void
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
  const [form, setForm] = useState<ChatModelSettingsFormState>(() =>
    createInitialFormState(model),
  )
  const [extraInstructionsOverflow, setExtraInstructionsOverflow] =
    useState(false)
  const isOpenAiCompatible = isOpenAiCompatibleChatModel(model)
  const isOpenRouter = model.providerType === 'openrouter'
  const updateField = <K extends keyof ChatModelSettingsFormState>(
    key: K,
    value: ChatModelSettingsFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key === 'extraInstructions') setExtraInstructionsOverflow(false)
  }
  const profile = lookupModelProfile(model.providerType, model.model)
  const draft = buildDraftChatModel(model, form)
  const warnings = evaluateChatModelWarnings(draft, profile, plugin.settings)
  // The value used when the override is left blank (known-model table → default).
  const autoContextWindow = resolveContextWindow({
    ...model,
    contextWindow: undefined,
  })

  const handleFillRecommended = () => {
    if (!profile) return
    const result = applyRecommendedProfileToForm(
      form,
      profile,
      getCurrentLocale(),
    )
    setForm(result.nextForm)
    setExtraInstructionsOverflow(result.extraInstructionsOverflow)
  }

  const handleApplySuggested = (fields: DiagnosticFormFields) => {
    const result = applyRecommendedFieldsToForm(
      form,
      fields,
      getCurrentLocale(),
    )
    setForm(result.nextForm)
    setExtraInstructionsOverflow(result.extraInstructionsOverflow)
  }

  const handleSubmit = async () => {
    if (!['inherit', 'true', 'false'].includes(form.supportsTools)) {
      new Notice(t('settings.chatModels.errorsDetails.supportsToolsInvalid'))
      return
    }
    if (
      isOpenAiCompatible &&
      !REASONING_EFFORT_VALUES.includes(form.toolTurnReasoningEffort)
    ) {
      new Notice(
        t('settings.chatModels.errorsDetails.toolTurnReasoningEffortInvalid'),
      )
      return
    }
    if (
      isOpenAiCompatible &&
      !REASONING_EFFORT_VALUES.includes(form.selectionReasoningEffort)
    ) {
      new Notice(
        t('settings.chatModels.errorsDetails.selectionReasoningEffortInvalid'),
      )
      return
    }
    if (
      isOpenRouter &&
      !['unset', 'true', 'false'].includes(form.openRouterAllowFallbacks)
    ) {
      new Notice(
        t('settings.chatModels.errorsDetails.openRouterAllowFallbacksInvalid'),
      )
      return
    }
    if (
      isOpenRouter &&
      !OPENROUTER_REASONING_EFFORT_VALUES.includes(
        form.openRouterReasoningEffort,
      )
    ) {
      new Notice(
        t('settings.chatModels.errorsDetails.openRouterReasoningEffortInvalid'),
      )
      return
    }
    if (
      isOpenRouter &&
      !['unset', 'true', 'false'].includes(form.openRouterReasoningEnabled)
    ) {
      new Notice(
        t(
          'settings.chatModels.errorsDetails.openRouterReasoningEnabledInvalid',
        ),
      )
      return
    }

    const trimmedSelectionTimeout = form.selectionTimeoutSec.trim()
    if (trimmedSelectionTimeout !== '') {
      const value = Number(trimmedSelectionTimeout)
      if (!Number.isInteger(value) || value < 1 || value > 120) {
        new Notice(
          t('settings.chatModels.errorsDetails.selectionTimeoutSecInvalid'),
        )
        return
      }
    }

    const trimmedContextWindow = form.contextWindow.trim()
    let parsedContextWindow: number | undefined
    if (trimmedContextWindow !== '') {
      const value = Number(trimmedContextWindow)
      if (!Number.isInteger(value) || value <= 0) {
        new Notice(t('settings.chatModels.errorsDetails.contextWindowInvalid'))
        return
      }
      parsedContextWindow = value
    }

    if (isOpenRouter) {
      const trimmedReasoningMaxTokens = form.openRouterReasoningMaxTokens.trim()
      if (trimmedReasoningMaxTokens !== '') {
        const value = Number(trimmedReasoningMaxTokens)
        if (!Number.isInteger(value) || value < 1) {
          new Notice(
            t(
              'settings.chatModels.errorsDetails.openRouterReasoningMaxTokensInvalid',
            ),
          )
          return
        }
        const effectiveContextWindow = parsedContextWindow ?? autoContextWindow
        const outputBudget = computeOutputBudget(
          effectiveContextWindow,
          plugin.settings.verbex.context.reservedOutputTokens,
        )
        if (value >= outputBudget) {
          new Notice(
            t(
              'settings.chatModels.errorsDetails.openRouterReasoningMaxTokensExceedsOutput',
              { outputBudget },
            ),
          )
          return
        }
      }
    }

    const normalizedExtraInstructions = normalizeExtraInstructions(
      form.extraInstructions,
    )
    if (
      normalizedExtraInstructions &&
      normalizedExtraInstructions.length > EXTRA_INSTRUCTIONS_MAX_LENGTH
    ) {
      new Notice(
        t('settings.chatModels.errorsDetails.extraInstructionsTooLong', {
          max: EXTRA_INSTRUCTIONS_MAX_LENGTH,
        }),
      )
      return
    }

    const updatedModel = buildDraftChatModel(model, form)

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
      <ModelRecommendedSettingsCard
        draft={draft}
        profile={profile}
        settings={plugin.settings}
        warnings={warnings}
        extraInstructionsOverflow={extraInstructionsOverflow}
        onFillRecommended={handleFillRecommended}
        diagnosisSlot={
          !profile ? (
            <ModelDiagnosticsPanel
              draft={draft}
              provider={provider}
              settings={plugin.settings}
              onApplySuggested={handleApplySuggested}
            />
          ) : undefined
        }
      />

      {webHandsEnabled && (
        <ObsidianSetting
          name={t('settings.chatModels.browserImagesField.name')}
          desc={t('settings.chatModels.browserImagesField.desc')}
        >
          <ObsidianDropdown
            value={String(form.browserImages)}
            options={{
              false: t('settings.common.disabled'),
              true: t('settings.common.enabled'),
            }}
            onChange={(value: string) =>
              updateField('browserImages', value === 'true')
            }
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
          value={form.supportsTools}
          options={{
            inherit: t('settings.common.inherit', {
              status: providerStatusText,
            }),
            true: t('settings.common.enabled'),
            false: t('settings.common.disabled'),
          }}
          onChange={(value: string) => updateField('supportsTools', value)}
        />
      </ObsidianSetting>

      <ToolCallProbeSetting
        provider={provider}
        model={draft}
        settings={plugin.settings}
      />

      {isOpenAiCompatible && (
        <OpenAIApiSetting
          value={form.apiMode}
          onChange={(value) => updateField('apiMode', value)}
          chatOnly={model.providerType === 'openrouter'}
        />
      )}
      {isOpenAiCompatible && (
        <ObsidianSetting
          name={t('settings.chatModels.toolTurnReasoningEffortField.name')}
          desc={t('settings.chatModels.toolTurnReasoningEffortField.desc')}
        >
          <ObsidianDropdown
            value={form.toolTurnReasoningEffort}
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
              updateField(
                'toolTurnReasoningEffort',
                value as ToolTurnReasoningEffortSetting,
              )
            }
          />
        </ObsidianSetting>
      )}
      {isOpenAiCompatible && (
        <ObsidianSetting
          name={t('settings.chatModels.selectionReasoningEffortField.name')}
          desc={t('settings.chatModels.selectionReasoningEffortField.desc')}
        >
          <ObsidianDropdown
            value={form.selectionReasoningEffort}
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
              updateField(
                'selectionReasoningEffort',
                value as ToolTurnReasoningEffortSetting,
              )
            }
          />
        </ObsidianSetting>
      )}
      <ObsidianSetting
        name={t('settings.chatModels.selectionTimeoutSecField.name')}
        desc={t('settings.chatModels.selectionTimeoutSecField.desc')}
      >
        <ObsidianTextInput
          value={form.selectionTimeoutSec}
          type="number"
          placeholder={t(
            'settings.chatModels.selectionTimeoutSecField.placeholder',
          )}
          onChange={(value: string) =>
            updateField('selectionTimeoutSec', value)
          }
        />
      </ObsidianSetting>
      {isOpenRouter && (
        <>
          <ObsidianSetting
            name={t('settings.chatModels.openRouterProviderOrderField.name')}
            desc={t('settings.chatModels.openRouterProviderOrderField.desc')}
          >
            <ObsidianTextInput
              value={form.openRouterOrder}
              placeholder={t(
                'settings.chatModels.openRouterProviderOrderField.placeholder',
              )}
              onChange={(value: string) =>
                updateField('openRouterOrder', value)
              }
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t('settings.chatModels.openRouterProviderIgnoreField.name')}
            desc={t('settings.chatModels.openRouterProviderIgnoreField.desc')}
          >
            <ObsidianTextInput
              value={form.openRouterIgnore}
              placeholder={t(
                'settings.chatModels.openRouterProviderIgnoreField.placeholder',
              )}
              onChange={(value: string) =>
                updateField('openRouterIgnore', value)
              }
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t('settings.chatModels.openRouterAllowFallbacksField.name')}
            desc={t('settings.chatModels.openRouterAllowFallbacksField.desc')}
          >
            <ObsidianDropdown
              value={form.openRouterAllowFallbacks}
              options={{
                unset: t(
                  'settings.chatModels.openRouterAllowFallbacksOptions.unset',
                ),
                true: t(
                  'settings.chatModels.openRouterAllowFallbacksOptions.true',
                ),
                false: t(
                  'settings.chatModels.openRouterAllowFallbacksOptions.false',
                ),
              }}
              onChange={(value: string) =>
                updateField(
                  'openRouterAllowFallbacks',
                  value as TriStateSetting,
                )
              }
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t(
              'settings.chatModels.openRouterReasoningMaxTokensField.name',
            )}
            desc={t(
              'settings.chatModels.openRouterReasoningMaxTokensField.desc',
            )}
          >
            <ObsidianTextInput
              value={form.openRouterReasoningMaxTokens}
              type="number"
              placeholder={t(
                'settings.chatModels.openRouterReasoningMaxTokensField.placeholder',
              )}
              onChange={(value: string) =>
                updateField('openRouterReasoningMaxTokens', value)
              }
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t('settings.chatModels.openRouterReasoningEffortField.name')}
            desc={t('settings.chatModels.openRouterReasoningEffortField.desc')}
          >
            <ObsidianDropdown
              value={form.openRouterReasoningEffort}
              options={{
                unset: t(
                  'settings.chatModels.openRouterReasoningEffortOptions.unset',
                ),
                minimal: t(
                  'settings.chatModels.openRouterReasoningEffortOptions.minimal',
                ),
                low: t(
                  'settings.chatModels.openRouterReasoningEffortOptions.low',
                ),
                medium: t(
                  'settings.chatModels.openRouterReasoningEffortOptions.medium',
                ),
                high: t(
                  'settings.chatModels.openRouterReasoningEffortOptions.high',
                ),
                xhigh: t(
                  'settings.chatModels.openRouterReasoningEffortOptions.xhigh',
                ),
              }}
              onChange={(value: string) =>
                updateField(
                  'openRouterReasoningEffort',
                  value as OpenRouterReasoningEffortSetting,
                )
              }
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t('settings.chatModels.openRouterReasoningEnabledField.name')}
            desc={t('settings.chatModels.openRouterReasoningEnabledField.desc')}
          >
            <ObsidianDropdown
              value={form.openRouterReasoningEnabled}
              options={{
                unset: t(
                  'settings.chatModels.openRouterReasoningEnabledOptions.unset',
                ),
                true: t(
                  'settings.chatModels.openRouterReasoningEnabledOptions.true',
                ),
                false: t(
                  'settings.chatModels.openRouterReasoningEnabledOptions.false',
                ),
              }}
              onChange={(value: string) =>
                updateField(
                  'openRouterReasoningEnabled',
                  value as TriStateSetting,
                )
              }
            />
          </ObsidianSetting>
        </>
      )}

      {isOpenAiCompatible && (
        <>
          <ObsidianSetting
            name={t('settings.chatModels.supportsNoneField.name')}
            desc={t('settings.chatModels.compatibilityOverrideDesc')}
          >
            <ObsidianDropdown
              value={form.supportsNone}
              options={{
                inherit: t('settings.chatModels.compatibilityAuto'),
                true: t('settings.common.enabled'),
                false: t('settings.common.disabled'),
              }}
              onChange={(value: string) => updateField('supportsNone', value)}
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t('settings.chatModels.chatToolsField.name')}
            desc={t('settings.chatModels.compatibilityOverrideDesc')}
          >
            <ObsidianDropdown
              value={form.chatTools}
              options={{
                inherit: t('settings.chatModels.compatibilityAuto'),
                any: t('settings.chatModels.chatToolsOptions.any'),
                'none-only': t('settings.chatModels.chatToolsOptions.noneOnly'),
                unsupported: t(
                  'settings.chatModels.chatToolsOptions.unsupported',
                ),
              }}
              onChange={(value: string) => updateField('chatTools', value)}
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
          value={form.contextWindow}
          type="number"
          placeholder={`${t('settings.context.currentNoteModeOptions.auto')} (${autoContextWindow})`}
          onChange={(value: string) => updateField('contextWindow', value)}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.chatModels.promptLevelField.name')}
        desc={t('settings.chatModels.promptLevelField.desc')}
      >
        <ObsidianDropdown
          value={form.promptLevel}
          options={{
            [PromptLevel.Default]: t(
              'settings.chatModels.promptLevelOptions.default',
            ),
            [PromptLevel.Simple]: t(
              'settings.chatModels.promptLevelOptions.simple',
            ),
          }}
          onChange={(value: string) => updateField('promptLevel', value)}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.chatModels.extraInstructionsField.name')}
        desc={t('settings.chatModels.extraInstructionsField.desc')}
        className="verbex-settings-textarea-header"
      />

      <ObsidianSetting className="verbex-settings-textarea">
        <ObsidianTextArea
          value={form.extraInstructions}
          placeholder={t(
            'settings.chatModels.extraInstructionsField.placeholder',
          )}
          onChange={(value: string) => updateField('extraInstructions', value)}
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
