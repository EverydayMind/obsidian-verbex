import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import { DEFAULT_PROVIDERS, PROVIDER_TYPES_INFO } from '../../../constants'
import { getProviderClient } from '../../../core/llm/manager'
import {
  ModelDiscoveryEntry,
  ModelDiscoveryResult,
  allocateModelId,
  discoverProviderModels,
  resolveModelPickerMode,
} from '../../../core/llm/modelDiscovery'
import {
  firstReadyProvider,
  providerDiscoveryReadiness,
} from '../../../core/llm/providerDiscoveryReadiness'
import { supportedDimensionsForIndex } from '../../../database/schema'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import {
  EmbeddingModel,
  embeddingModelSchema,
} from '../../../types/embedding-model.types'
import { LLMProvider } from '../../../types/provider.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ReactModal } from '../../common/ReactModal'
import { ConfirmModal } from '../../modals/ConfirmModal'

type AddEmbeddingModelModalComponentProps = {
  plugin: VerbexPlugin
  onClose: () => void
}

type EmbeddingModelDraft = Omit<EmbeddingModel, 'dimension'>

export class AddEmbeddingModelModal extends ReactModal<AddEmbeddingModelModalComponentProps> {
  constructor(app: App, plugin: VerbexPlugin) {
    super({
      app: app,
      Component: AddEmbeddingModelModalComponent,
      props: { plugin },
      options: {
        title: t('settings.embeddingModels.addCustomModal'),
      },
    })
  }
}

function embeddingProviders(plugin: VerbexPlugin): LLMProvider[] {
  return plugin.settings.providers.filter(
    (provider) => PROVIDER_TYPES_INFO[provider.type].supportEmbedding,
  )
}

function preferredEmbeddingProvider(
  providers: readonly LLMProvider[],
): LLMProvider | undefined {
  return (
    firstReadyProvider(providers) ??
    providers.find((provider) => provider.id === DEFAULT_PROVIDERS[0]?.id) ??
    providers[0]
  )
}

function emptyEmbeddingForm(
  provider: LLMProvider | undefined,
): EmbeddingModelDraft {
  return {
    providerId: provider?.id ?? '',
    providerType: (provider?.type ??
      'openai') as EmbeddingModel['providerType'],
    id: '',
    model: '',
    outputDimension: undefined,
  }
}

function discoveryEntryKey(entry: Pick<ModelDiscoveryEntry, 'id' | 'model'>) {
  return `${entry.id}:${entry.model}`
}

function isAlreadyAdded(
  entry: ModelDiscoveryEntry,
  providerId: string,
  existing: readonly EmbeddingModel[],
): boolean {
  return existing.some(
    (model) => model.providerId === providerId && model.model === entry.model,
  )
}

function AddEmbeddingModelModalComponent({
  plugin,
  onClose,
}: AddEmbeddingModelModalComponentProps) {
  const providers = embeddingProviders(plugin)
  const initialProvider = preferredEmbeddingProvider(providers)
  const [providerId, setProviderId] = useState(initialProvider?.id ?? '')
  const provider = providers.find((candidate) => candidate.id === providerId)

  const [formData, setFormData] = useState<EmbeddingModelDraft>(() =>
    emptyEmbeddingForm(initialProvider),
  )
  const [outputDimensionInput, setOutputDimensionInput] = useState('')
  const [discovery, setDiscovery] = useState<ModelDiscoveryResult | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [userForcedCustom, setUserForcedCustom] = useState(false)
  const [selectedKey, setSelectedKey] = useState('')
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const generationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const fetchModels = useCallback(
    (candidateProviderId: string, forceRefresh: boolean) => {
      const target = plugin.settings.providers.find(
        (candidate) =>
          candidate.id === candidateProviderId &&
          PROVIDER_TYPES_INFO[candidate.type].supportEmbedding,
      )
      generationRef.current += 1
      const myGeneration = generationRef.current
      abortRef.current?.abort()
      setSelectedKey('')
      if (!target || providerDiscoveryReadiness(target) !== 'ready') {
        setDiscovery(null)
        setIsFetching(false)
        return
      }

      const controller = new AbortController()
      abortRef.current = controller
      setIsFetching(true)
      void discoverProviderModels(target, {
        cache: plugin.modelDiscoveryCache,
        forceRefresh,
        signal: controller.signal,
      }).then((result) => {
        if (myGeneration !== generationRef.current) return
        setDiscovery(result)
        setIsFetching(false)
      })
    },
    [plugin],
  )

  useEffect(() => {
    setUserForcedCustom(false)
    setFormData(emptyEmbeddingForm(provider))
    setOutputDimensionInput('')
    fetchModels(providerId, false)
    return () => {
      abortRef.current?.abort()
    }
  }, [fetchModels, provider, providerId])

  const mode = resolveModelPickerMode(discovery, userForcedCustom)
  const readiness = provider ? providerDiscoveryReadiness(provider) : 'ready'
  const existingModels = plugin.settings.embeddingModels
  const searchLower = search.trim().toLowerCase()
  const filteredEntries = (discovery?.models ?? []).filter(
    (entry) =>
      entry.capabilities?.embedding !== false &&
      (!searchLower ||
        entry.id.toLowerCase().includes(searchLower) ||
        entry.model.toLowerCase().includes(searchLower)),
  )

  const handleSelectEntry = (entry: ModelDiscoveryEntry) => {
    if (!provider || isAlreadyAdded(entry, provider.id, existingModels)) return
    setSelectedKey(discoveryEntryKey(entry))
    setFormData((previous) => ({
      ...previous,
      id: allocateModelId(entry.id, provider.id, entry.model, existingModels),
      model: entry.model,
    }))
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (!provider) {
        throw new Error(t('settings.embeddingModels.errors.providerNotFound'))
      }
      if (existingModels.some((model) => model.id === formData.id)) {
        throw new Error(t('settings.embeddingModels.errors.alreadyExists'))
      }

      const providerClient = getProviderClient({
        settings: plugin.settings,
        providerId: formData.providerId,
      })

      // Keep the existing one-request dimension probe for both manually
      // entered and discovered models. A catalog entry is only a suggestion;
      // the provider response remains the source of truth for dimension.
      const embeddingResult = await providerClient.getEmbedding(
        formData.model,
        'test',
        { dimensions: formData.outputDimension },
      )

      if (!Array.isArray(embeddingResult) || embeddingResult.length === 0) {
        throw new Error(t('settings.embeddingModels.errors.invalidResult'))
      }

      const dimension = embeddingResult.length
      if (
        formData.outputDimension !== undefined &&
        dimension !== formData.outputDimension
      ) {
        throw new Error(
          t('settings.embeddingModels.errors.matryoshkaError', {
            reqDim: formData.outputDimension,
            retDim: dimension,
          }),
        )
      }

      if (!supportedDimensionsForIndex.includes(dimension)) {
        const confirmed = await new Promise<boolean>((resolve) => {
          new ConfirmModal(plugin.app, {
            title: t('settings.embeddingModels.performanceWarning.title'),
            message: t('settings.embeddingModels.performanceWarning.message', {
              dim: dimension,
              optDims: supportedDimensionsForIndex.join(', '),
            }),
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
          }).open()
        })

        if (!confirmed) return
      }

      const validationResult = embeddingModelSchema.safeParse({
        ...formData,
        dimension,
      })
      if (!validationResult.success) {
        throw new Error(
          validationResult.error.issues
            .map((issue) => issue.message)
            .join('\n'),
        )
      }

      await plugin.setSettings({
        ...plugin.settings,
        embeddingModels: [...existingModels, validationResult.data],
      })
      onClose()
    } catch (error) {
      new Notice(
        error instanceof Error
          ? error.message
          : t('settings.embeddingModels.errors.unknownError'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const canShowList =
    discovery &&
    (discovery.status === 'remote' || discovery.status === 'curated')
  const providerStatus = provider
    ? PROVIDER_TYPES_INFO[provider.type].label
    : ''

  return (
    <>
      <ObsidianSetting
        name={t('settings.embeddingModels.providerIdField')}
        required
      >
        <ObsidianDropdown
          value={providerId}
          options={Object.fromEntries(
            providers.map((candidate) => [candidate.id, candidate.id]),
          )}
          onChange={(value) => setProviderId(value)}
        />
      </ObsidianSetting>

      {readiness !== 'ready' && (
        <div className="verbex-model-discovery__notice">
          {t(
            readiness === 'credentials_missing'
              ? 'settings.chatModels.discovery.missingApiKey'
              : 'settings.chatModels.discovery.missingBaseUrl',
          )}
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
                    entry.capabilities?.embedding === undefined
                  return (
                    <label
                      key={discoveryEntryKey(entry)}
                      className="verbex-model-discovery__item"
                    >
                      <input
                        type="radio"
                        name="verbex-embedding-model"
                        disabled={alreadyAdded}
                        checked={selectedKey === discoveryEntryKey(entry)}
                        onChange={() => handleSelectEntry(entry)}
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
                        <span className="verbex-model-discovery__badge">
                          {t('settings.chatModels.discovery.unverifiedBadge')}
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
              <div className="verbex-model-discovery__status">
                {selectedKey
                  ? `${providerStatus}: ${formData.model}`
                  : t('settings.embeddingModels.discovery.selectModel')}
              </div>
              <ObsidianSetting
                name={t('settings.embeddingModels.outputDimensionsField.name')}
                desc={t('settings.embeddingModels.outputDimensionsField.desc')}
              >
                <ObsidianTextInput
                  value={outputDimensionInput}
                  placeholder="e.g., 768"
                  onChange={(value: string) => {
                    setOutputDimensionInput(value)
                    const parsed = parseInt(value, 10)
                    setFormData((previous) => ({
                      ...previous,
                      outputDimension: isNaN(parsed) ? undefined : parsed,
                    }))
                  }}
                />
              </ObsidianSetting>
              <ObsidianSetting>
                <ObsidianButton
                  text={t('settings.common.add')}
                  onClick={(...args) => {
                    void handleSubmit(...args)
                  }}
                  cta
                  disabled={submitting || !selectedKey}
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
            name={t('settings.embeddingModels.idField.name')}
            desc={t('settings.embeddingModels.idField.desc')}
            required
          >
            <ObsidianTextInput
              value={formData.id}
              placeholder="my-custom-embedding-model"
              onChange={(value: string) =>
                setFormData((previous) => ({ ...previous, id: value }))
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.embeddingModels.modelNameField.name')}
            required
          >
            <ObsidianTextInput
              value={formData.model}
              placeholder={t(
                'settings.embeddingModels.modelNameField.placeholder',
              )}
              onChange={(value: string) =>
                setFormData((previous) => ({ ...previous, model: value }))
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.embeddingModels.outputDimensionsField.name')}
            desc={t('settings.embeddingModels.outputDimensionsField.desc')}
          >
            <ObsidianTextInput
              value={outputDimensionInput}
              placeholder="e.g., 768"
              onChange={(value: string) => {
                setOutputDimensionInput(value)
                const parsed = parseInt(value, 10)
                setFormData((previous) => ({
                  ...previous,
                  outputDimension: isNaN(parsed) ? undefined : parsed,
                }))
              }}
            />
          </ObsidianSetting>

          <ObsidianSetting>
            <ObsidianButton
              text={t('settings.common.add')}
              onClick={(...args) => {
                void handleSubmit(...args)
              }}
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
