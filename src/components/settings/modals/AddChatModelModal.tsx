import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import { PROVIDER_TYPES_INFO } from '../../../constants'
import {
  ModelDiscoveryEntry,
  ModelDiscoveryResult,
  allocateModelId,
  discoverProviderModels,
  resolveModelPickerMode,
} from '../../../core/llm/modelDiscovery'
import { autoAssignFirstUsableModel } from '../../../core/llm/modelReadiness'
import { defaultApiModeForNewModel } from '../../../core/llm/openAIOfficialHost'
import { OpenAIApiMode } from '../../../core/llm/openAIRequestPolicy'
import {
  firstReadyProvider,
  providerDiscoveryReadiness,
  resolveModelDiscoveryReadiness,
} from '../../../core/llm/providerDiscoveryReadiness'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { verbexSettingsSchema } from '../../../settings/schema/setting.types'
import { ChatModel, chatModelSchema } from '../../../types/chat-model.types'
import { PromptLevel } from '../../../types/prompt-level.types'
import { LLMProvider } from '../../../types/provider.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ReactModal } from '../../common/ReactModal'
import { OpenAIApiSetting } from '../sections/models/OpenAIApiSetting'
import { ToolCallProbeSetting } from '../sections/models/ToolCallProbeSetting'

import {
  openAddProviderModal,
  openEditProviderModal,
} from './providerModalOpeners'

type AddChatModelModalComponentProps = {
  plugin: VerbexPlugin
  onClose: () => void
  initialProviderId?: string
}

export class AddChatModelModal extends ReactModal<AddChatModelModalComponentProps> {
  constructor(app: App, plugin: VerbexPlugin, initialProviderId?: string) {
    super({
      app: app,
      Component: AddChatModelModalComponent,
      props: { plugin, initialProviderId },
      options: {
        title: t('settings.chatModels.addCustomModal'),
      },
    })
  }
}

function emptyCustomForm(provider: LLMProvider | undefined): ChatModel {
  return {
    providerId: provider?.id ?? '',
    providerType: provider?.type ?? 'openai',
    id: '',
    model: '',
    promptLevel: PromptLevel.Default,
  }
}

/** discovery entries whose (providerId, model) pair is already a registered chat model. */
function isAlreadyAdded(
  entry: ModelDiscoveryEntry,
  providerId: string,
  existing: readonly ChatModel[],
): boolean {
  return existing.some(
    (m) => m.providerId === providerId && m.model === entry.model,
  )
}

function AddChatModelModalComponent({
  plugin,
  onClose,
  initialProviderId,
}: AddChatModelModalComponentProps) {
  const providers = plugin.settings.providers
  const [providerId, setProviderId] = useState(
    providers.some((p) => p.id === initialProviderId)
      ? initialProviderId
      : (firstReadyProvider(providers)?.id ??
          providers.find(
            (p) => p.id === plugin.settings.chatModels[0]?.providerId,
          )?.id ??
          providers[0]?.id),
  )
  const provider = providers.find((p) => p.id === providerId)
  const [apiMode, setApiMode] = useState<OpenAIApiMode>(
    defaultApiModeForNewModel(provider),
  )
  const showApiMode =
    provider &&
    [
      'openai',
      'openrouter',
      'ollama',
      'lmstudio',
      'openai-compatible',
    ].includes(provider.type)

  const [discovery, setDiscovery] = useState<ModelDiscoveryResult | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [userForcedCustom, setUserForcedCustom] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [customForm, setCustomForm] = useState<ChatModel>(() =>
    emptyCustomForm(provider),
  )
  const [submitting, setSubmitting] = useState(false)

  const generationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const fetchModels = useCallback(
    (pid: string | undefined, forceRefresh: boolean) => {
      const target = plugin.settings.providers.find((x) => x.id === pid)
      generationRef.current += 1
      const myGeneration = generationRef.current
      abortRef.current?.abort()
      if (!target || providerDiscoveryReadiness(target) !== 'ready') {
        setDiscovery(null)
        setIsFetching(false)
        return
      }
      const controller = new AbortController()
      abortRef.current = controller
      setIsFetching(true)
      setSelectedIds(new Set())
      void discoverProviderModels(target, {
        cache: plugin.modelDiscoveryCache,
        forceRefresh,
        signal: controller.signal,
      }).then((result) => {
        if (myGeneration !== generationRef.current) return // stale response
        setDiscovery(result)
        setIsFetching(false)
      })
    },
    [plugin],
  )

  useEffect(() => {
    setUserForcedCustom(false)
    setCustomForm(emptyCustomForm(provider))
    setApiMode(defaultApiModeForNewModel(provider))
    fetchModels(providerId, false)
    return () => {
      abortRef.current?.abort()
    }
    // fetchModels is stable across renders (only depends on `plugin`).
  }, [providerId])

  const mode = resolveModelPickerMode(discovery, userForcedCustom)
  const readiness = resolveModelDiscoveryReadiness(provider)
  const existingModels = plugin.settings.chatModels
  const searchLower = search.trim().toLowerCase()
  const filteredEntries = (discovery?.models ?? []).filter(
    (entry) =>
      !searchLower ||
      entry.id.toLowerCase().includes(searchLower) ||
      entry.model.toLowerCase().includes(searchLower),
  )

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Single settings write shared by both add paths (§3.1 all-or-nothing). */
  const commitNewModels = async (newModels: ChatModel[]) => {
    const nextChatModels = [...plugin.settings.chatModels, ...newModels]
    const settingsWithNewModels = {
      ...plugin.settings,
      chatModels: nextChatModels,
    }
    const candidate = {
      ...settingsWithNewModels,
      chatModelId: autoAssignFirstUsableModel(
        settingsWithNewModels,
        plugin.settings.chatModelId,
      ),
      applyModelId: autoAssignFirstUsableModel(
        settingsWithNewModels,
        plugin.settings.applyModelId,
      ),
    }
    const validated = verbexSettingsSchema.safeParse(candidate)
    if (!validated.success) {
      new Notice(t('settings.chatModels.errors.saveFailed'))
      return
    }
    await plugin.setSettings(validated.data)
    const active = validated.data.chatModels.find(
      (model) => model.id === validated.data.chatModelId,
    )
    new Notice(
      t('settings.chatModels.addedNotice', {
        count: newModels.length,
        name: active?.model ?? validated.data.chatModelId,
      }),
    )
    onClose()
  }

  const handleAddSelected = async () => {
    if (!provider || selectedIds.size === 0) {
      new Notice(t('settings.chatModels.errors.noModelsSelected'))
      return
    }
    setSubmitting(true)
    try {
      const reserved: { id: string }[] = [...existingModels]
      const newModels: ChatModel[] = []
      for (const entry of discovery?.models ?? []) {
        if (!selectedIds.has(entry.id)) continue
        if (entry.capabilities?.chat === false) continue
        if (isAlreadyAdded(entry, provider.id, existingModels)) continue
        const allocatedId = allocateModelId(
          entry.id,
          provider.id,
          entry.model,
          reserved,
        )
        reserved.push({ id: allocatedId })
        const validated = chatModelSchema.safeParse({
          providerId: provider.id,
          providerType: provider.type,
          id: allocatedId,
          model: entry.model,
          ...(showApiMode ? { apiMode } : {}),
          promptLevel: PromptLevel.Default,
          enable: true,
          ...(entry.contextWindow !== undefined
            ? { contextWindow: entry.contextWindow }
            : {}),
        })
        if (validated.success) newModels.push(validated.data)
      }
      if (newModels.length === 0) {
        new Notice(t('settings.chatModels.errors.noModelsSelected'))
        return
      }
      await commitNewModels(newModels)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddCustom = async () => {
    if (!provider) return
    if (existingModels.some((m) => m.id === customForm.id)) {
      new Notice(t('settings.chatModels.errors.alreadyExists'))
      return
    }
    const validated = chatModelSchema.safeParse({
      ...customForm,
      ...(showApiMode ? { apiMode } : {}),
      enable: true,
    })
    if (!validated.success) {
      new Notice(validated.error.issues.map((v) => v.message).join('\n'))
      return
    }
    setSubmitting(true)
    try {
      await commitNewModels([validated.data])
    } finally {
      setSubmitting(false)
    }
  }

  const canShowList =
    discovery &&
    (discovery.status === 'remote' || discovery.status === 'curated')
  const providerSupportsTools = provider
    ? (provider.supportsTools ??
      PROVIDER_TYPES_INFO[provider.type].supportTools)
    : false
  const providerStatusText = providerSupportsTools
    ? t('settings.common.enabled')
    : t('settings.common.disabled')

  return (
    <>
      <ObsidianSetting name={t('settings.chatModels.providerIdField')} required>
        <ObsidianDropdown
          value={providerId ?? ''}
          options={Object.fromEntries(providers.map((p) => [p.id, p.id]))}
          onChange={(value) => setProviderId(value)}
        />
      </ObsidianSetting>

      {showApiMode && (
        <OpenAIApiSetting
          value={apiMode}
          onChange={setApiMode}
          chatOnly={provider?.type === 'openrouter'}
        />
      )}

      {readiness !== 'ready' && (
        <div className="verbex-model-discovery__notice">
          <div>
            {t(
              readiness === 'provider_missing'
                ? 'settings.chatModels.discovery.missingProvider'
                : readiness === 'credentials_missing'
                  ? 'settings.chatModels.discovery.missingApiKey'
                  : 'settings.chatModels.discovery.missingBaseUrl',
            )}
          </div>
          <div className="verbex-model-discovery__actions">
            <ObsidianButton
              text={t(
                provider
                  ? 'settings.chatModels.discovery.setupProvider'
                  : 'settings.chatModels.discovery.addProvider',
              )}
              cta
              onClick={() => {
                onClose()
                if (provider) {
                  openEditProviderModal(plugin.app, plugin, provider)
                } else {
                  openAddProviderModal(plugin.app, plugin)
                }
              }}
            />
            {provider && (
              <ObsidianButton
                text={t('settings.chatModels.discovery.addDifferentProvider')}
                onClick={() => {
                  onClose()
                  openAddProviderModal(plugin.app, plugin)
                }}
              />
            )}
            <ObsidianButton
              text={t('settings.common.cancel')}
              onClick={onClose}
            />
          </div>
        </div>
      )}

      {mode === 'discovery' && readiness === 'ready' && (
        <div className="verbex-model-discovery">
          {isFetching && (
            <div className="verbex-model-discovery__status">
              {t('settings.chatModels.discovery.fetching')}
            </div>
          )}
          {!isFetching && discovery?.status === 'error' && (
            <div className="verbex-model-discovery__notice verbex-model-discovery__notice--error">
              <div>
                {discovery.errorCategory
                  ? t(
                      `settings.chatModels.discovery.errors.${discovery.errorCategory}`,
                    )
                  : discovery.safeErrorMessage}
              </div>
              <div className="verbex-model-discovery__actions">
                <ObsidianButton
                  text={t('settings.chatModels.discovery.retry')}
                  onClick={() => fetchModels(providerId, true)}
                />
                <ObsidianButton
                  text={t('settings.chatModels.discovery.customInput')}
                  onClick={() => setUserForcedCustom(true)}
                />
              </div>
            </div>
          )}
          {!isFetching && canShowList && discovery && (
            <>
              {discovery.status === 'curated' && (
                <div className="verbex-model-discovery__notice">
                  {t('settings.chatModels.discovery.curatedBadge')}
                  {discovery.errorCategory
                    ? ` — ${t(`settings.chatModels.discovery.errors.${discovery.errorCategory}`)}`
                    : ''}
                </div>
              )}
              {discovery.truncated && (
                <div className="verbex-model-discovery__notice">
                  {t('settings.chatModels.discovery.truncated')}
                </div>
              )}
              <ObsidianSetting>
                <ObsidianTextInput
                  value={search}
                  placeholder={t(
                    'settings.chatModels.discovery.searchPlaceholder',
                  )}
                  onChange={setSearch}
                />
              </ObsidianSetting>
              <div className="verbex-model-discovery__list">
                {filteredEntries.map((entry) => {
                  const alreadyAdded = provider
                    ? isAlreadyAdded(entry, provider.id, existingModels)
                    : false
                  const unverified =
                    discovery.status === 'remote' &&
                    entry.capabilities?.chat === undefined
                  return (
                    <label
                      key={`${entry.id}:${entry.model}`}
                      className="verbex-model-discovery__item"
                    >
                      <input
                        type="checkbox"
                        disabled={alreadyAdded}
                        checked={selectedIds.has(entry.id)}
                        onChange={() => toggleSelected(entry.id)}
                      />
                      <span className="verbex-model-discovery__item-label">
                        {entry.id}
                      </span>
                      {alreadyAdded && (
                        <span className="verbex-model-discovery__badge">
                          {t('settings.chatModels.discovery.alreadyAdded')}
                        </span>
                      )}
                      {discovery.status === 'curated' && (
                        <span className="verbex-model-discovery__badge">
                          {t('settings.chatModels.discovery.curatedBadge')}
                        </span>
                      )}
                      {unverified && (
                        <span
                          className="verbex-model-discovery__badge"
                          title={t(
                            'settings.chatModels.discovery.unverifiedTitle',
                          )}
                        >
                          {t('settings.chatModels.discovery.unverifiedBadge')}
                        </span>
                      )}
                      {entry.contextWindow !== undefined && (
                        <span className="verbex-model-discovery__badge">
                          {t('settings.chatModels.discovery.contextWindow', {
                            count: entry.contextWindow.toLocaleString(),
                          })}
                        </span>
                      )}
                    </label>
                  )
                })}
                <button
                  type="button"
                  className="verbex-model-discovery__item verbex-model-discovery__item--action"
                  onClick={() => setUserForcedCustom(true)}
                >
                  {t('settings.chatModels.discovery.customInput')}
                </button>
              </div>
              <ObsidianSetting>
                <ObsidianButton
                  text={t('settings.chatModels.discovery.addSelected', {
                    count: selectedIds.size,
                  })}
                  onClick={() => void handleAddSelected()}
                  cta
                  disabled={submitting || selectedIds.size === 0}
                />
                <ObsidianButton
                  text={t('settings.common.cancel')}
                  onClick={onClose}
                />
              </ObsidianSetting>
            </>
          )}
        </div>
      )}

      {mode === 'custom' && (
        <>
          {discovery?.status === 'unsupported' && (
            <div className="verbex-model-discovery__notice">
              {t('settings.chatModels.discovery.unsupported')}
            </div>
          )}

          <ObsidianSetting
            name={t('settings.chatModels.idField.name')}
            desc={t('settings.chatModels.idField.desc')}
            required
          >
            <ObsidianTextInput
              value={customForm.id}
              placeholder="my-custom-model"
              onChange={(value: string) =>
                setCustomForm((prev) => ({ ...prev, id: value }))
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.chatModels.modelNameField.name')}
            required
          >
            <ObsidianTextInput
              value={customForm.model}
              placeholder={t('settings.chatModels.modelNameField.placeholder')}
              onChange={(value: string) =>
                setCustomForm((prev) => ({ ...prev, model: value }))
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.chatModels.promptLevelField.name')}
            desc={t('settings.chatModels.promptLevelField.desc')}
            required
          >
            <ObsidianDropdown
              value={(customForm.promptLevel ?? PromptLevel.Default).toString()}
              options={{
                [PromptLevel.Default]: t(
                  'settings.chatModels.promptLevelOptions.default',
                ),
                [PromptLevel.Simple]: t(
                  'settings.chatModels.promptLevelOptions.simple',
                ),
              }}
              onChange={(value: string) =>
                setCustomForm((prev) => ({
                  ...prev,
                  promptLevel: Number(value),
                }))
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.chatModels.supportsToolsField.name')}
            desc={t('settings.chatModels.supportsToolsField.desc', {
              status: providerStatusText,
            })}
          >
            <ObsidianDropdown
              value={
                customForm.supportsTools === undefined
                  ? 'inherit'
                  : customForm.supportsTools
                    ? 'true'
                    : 'false'
              }
              options={{
                inherit: t('settings.common.inherit', {
                  status: providerStatusText,
                }),
                true: t('settings.common.enabled'),
                false: t('settings.common.disabled'),
              }}
              onChange={(value: string) =>
                setCustomForm((prev) => ({
                  ...prev,
                  supportsTools:
                    value === 'inherit' ? undefined : value === 'true',
                }))
              }
            />
          </ObsidianSetting>

          <ToolCallProbeSetting
            key={`${providerId ?? ''}:${customForm.model}:${apiMode}`}
            provider={provider}
            model={
              showApiMode
                ? ({ ...customForm, apiMode } as ChatModel)
                : customForm
            }
            settings={plugin.settings}
          />

          <ObsidianSetting>
            <ObsidianButton
              text={t('settings.common.add')}
              onClick={() => void handleAddCustom()}
              cta
              disabled={submitting}
            />
            {canShowList && (
              <ObsidianButton
                text={t('settings.chatModels.discovery.backToList')}
                onClick={() => setUserForcedCustom(false)}
              />
            )}
            <ObsidianButton
              text={t('settings.common.cancel')}
              onClick={onClose}
            />
          </ObsidianSetting>
        </>
      )}
    </>
  )
}
