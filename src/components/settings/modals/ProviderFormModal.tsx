import { App, Notice } from 'obsidian'
import { useState } from 'react'

import {
  PROVIDER_DEFAULT_BASE_URLS,
  PROVIDER_TYPES_INFO,
} from '../../../constants'
import { testProviderConnection } from '../../../core/llm/manager'
import {
  createModelDiscoveryCache,
  discoverProviderModels,
  invalidateModelDiscoveryCache,
} from '../../../core/llm/modelDiscovery'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { providerSecretStore } from '../../../settings/providerSecrets'
import { LLMProvider, llmProviderSchema } from '../../../types/provider.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSecretInput } from '../../common/ObsidianSecretInput'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ReactModal } from '../../common/ReactModal'
import { ConfirmModal } from '../../modals/ConfirmModal'

import { AddChatModelModal } from './AddChatModelModal'

type ProviderFormComponentProps = {
  plugin: VerbexPlugin
  provider: LLMProvider | null // null for new provider
  onClose: () => void
}

export class AddProviderModal extends ReactModal<ProviderFormComponentProps> {
  constructor(app: App, plugin: VerbexPlugin) {
    super({
      app: app,
      Component: ProviderFormComponent,
      props: { plugin, provider: null },
      options: {
        title: t('settings.providers.addCustomModal'),
      },
    })
  }
}

export class EditProviderModal extends ReactModal<ProviderFormComponentProps> {
  constructor(app: App, plugin: VerbexPlugin, provider: LLMProvider) {
    super({
      app: app,
      Component: ProviderFormComponent,
      props: { plugin, provider },
      options: {
        title: t('settings.providers.editModal', { id: provider.id }),
      },
    })
  }
}

function ProviderFormComponent({
  plugin,
  provider,
  onClose,
}: ProviderFormComponentProps) {
  const store = providerSecretStore(plugin.app)
  const [formData, setFormData] = useState<LLMProvider>(
    provider
      ? {
          ...provider,
          ...(provider.apiKeySecret
            ? {
                apiKey: (() => {
                  try {
                    return store?.get(provider.apiKeySecret) ?? ''
                  } catch {
                    return ''
                  }
                })(),
              }
            : {}),
        }
      : {
          type: 'openai',
          id: '',
          apiKey: '',
          baseUrl: '',
          supportsTools: PROVIDER_TYPES_INFO.openai.supportTools,
        },
  )

  const [testing, setTesting] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const handlePreviewModels = async () => {
    const validationResult = llmProviderSchema.safeParse(formData)
    if (!validationResult.success) {
      new Notice(validationResult.error.issues.map((v) => v.message).join('\n'))
      return
    }
    setPreviewing(true)
    try {
      // A throwaway cache, not plugin.modelDiscoveryCache: this preview may
      // run against unsaved edits (different apiKey/baseUrl than what's on
      // disk under the same provider id), and discoverProviderModels always
      // writes its result back into whatever cache it's given — using the
      // shared cache here would risk a draft's result being served later for
      // the real, saved provider (§3.2).
      const result = await discoverProviderModels(validationResult.data, {
        cache: createModelDiscoveryCache(),
        forceRefresh: true,
      })
      if (result.status === 'unsupported') {
        new Notice(t('settings.providers.previewModels.unsupported'))
      } else if (result.models.length === 0) {
        new Notice(
          result.errorCategory
            ? t(`settings.chatModels.discovery.errors.${result.errorCategory}`)
            : t('settings.chatModels.discovery.errors.empty'),
        )
      } else {
        const preview = result.models
          .slice(0, 5)
          .map((m) => m.id)
          .join(', ')
        new Notice(
          t('settings.providers.previewModels.result', {
            count: result.models.length,
            preview,
          }),
        )
      }
    } finally {
      setPreviewing(false)
    }
  }

  const handleTestConnection = async () => {
    const validationResult = llmProviderSchema.safeParse(formData)
    if (!validationResult.success) {
      new Notice(validationResult.error.issues.map((v) => v.message).join('\n'))
      return
    }
    setTesting(true)
    try {
      // Prefer the selected model, then the first enabled model for this provider.
      const connectionModel =
        plugin.settings.chatModels.find(
          (model) =>
            model.providerId === formData.id &&
            model.id === plugin.settings.chatModelId &&
            model.enable !== false,
        ) ??
        plugin.settings.chatModels.find(
          (model) => model.providerId === formData.id && model.enable !== false,
        )
      const result = await testProviderConnection(
        validationResult.data,
        connectionModel,
      )
      new Notice(
        result.ok
          ? `✓ ${t('settings.providers.errors.connectionSuccess')}`
          : `✗ ${t('settings.providers.errors.connectionFailed', { message: result.message })}`,
      )
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async () => {
    let offerAddModels = false
    let savedProviderId = formData.id
    if (provider) {
      const newProviders = [...plugin.settings.providers]
      const currentProviderIndex = newProviders.findIndex(
        (v) => v.id === formData.id,
      )

      if (currentProviderIndex === -1) {
        new Notice(t('settings.providers.errors.notFound'))
        return
      }

      const validationResult = llmProviderSchema.safeParse(formData)
      if (!validationResult.success) {
        new Notice(
          validationResult.error.issues.map((v) => v.message).join('\n'),
        )
        return
      }

      await plugin.setSettings({
        ...plugin.settings,
        providers: [
          ...plugin.settings.providers.slice(0, currentProviderIndex),
          formData,
          ...plugin.settings.providers.slice(currentProviderIndex + 1),
        ],
      })
      // Editing may have changed apiKey/baseUrl/type, which changes the
      // discovery cache fingerprint — invalidate every entry for this
      // provider id so a stale pre-edit result is never served (§3.2, §4.4).
      invalidateModelDiscoveryCache(plugin.modelDiscoveryCache, formData.id)
    } else {
      if (
        plugin.settings.providers.some((p: LLMProvider) => p.id === formData.id)
      ) {
        new Notice(t('settings.providers.errors.alreadyExists'))
        return
      }

      const validationResult = llmProviderSchema.safeParse(formData)
      if (!validationResult.success) {
        new Notice(
          validationResult.error.issues.map((v) => v.message).join('\n'),
        )
        return
      }

      await plugin.setSettings({
        ...plugin.settings,
        providers: [...plugin.settings.providers, formData],
      })
      offerAddModels = true
      savedProviderId = validationResult.data.id
    }

    onClose()
    if (offerAddModels) {
      new ConfirmModal(plugin.app, {
        title: t('settings.providers.addModelsPrompt.title'),
        message: t('settings.providers.addModelsPrompt.message', {
          id: savedProviderId,
        }),
        ctaText: t('settings.providers.addModelsPrompt.ctaText'),
        onConfirm: () => {
          new AddChatModelModal(plugin.app, plugin, savedProviderId).open()
        },
      }).open()
    }
  }

  const providerTypeInfo = PROVIDER_TYPES_INFO[formData.type]

  const baseUrlDesc = PROVIDER_DEFAULT_BASE_URLS[formData.type]
    ? t('settings.providers.baseUrlField.optionalDesc', {
        defaultUrl: PROVIDER_DEFAULT_BASE_URLS[formData.type],
      })
    : t('settings.providers.baseUrlField.desc')

  return (
    <>
      {!provider && (
        <>
          <ObsidianSetting
            name={t('settings.providers.idField.name')}
            desc={t('settings.providers.idField.desc')}
            required
          >
            <ObsidianTextInput
              value={formData.id}
              placeholder="my-custom-provider"
              onChange={(value: string) =>
                setFormData((prev) => ({ ...prev, id: value }))
              }
            />
          </ObsidianSetting>

          <ObsidianSetting name={t('settings.providers.providerType')} required>
            <ObsidianDropdown
              value={formData.type}
              options={Object.fromEntries(
                Object.entries(PROVIDER_TYPES_INFO).map(([key, info]) => [
                  key,
                  info.label,
                ]),
              )}
              onChange={(value: string) =>
                // Switching provider type does not carry over the old
                // type's baseUrl/apiKey (§3.2): a key valid for one API is
                // not valid for another, and a stale baseUrl would make
                // discovery/chat silently target the wrong host. The user
                // re-enters both deliberately; the baseUrl field's own
                // placeholder/description still shows the new type's default.
                setFormData(
                  (prev) =>
                    ({
                      ...prev,
                      type: value,
                      apiKey: '',
                      apiKeySecret: undefined,
                      baseUrl: '',
                      supportsTools:
                        PROVIDER_TYPES_INFO[
                          value as keyof typeof PROVIDER_TYPES_INFO
                        ].supportTools,
                    }) as LLMProvider,
                )
              }
            />
          </ObsidianSetting>
        </>
      )}

      <ObsidianSetting
        name={t('settings.providers.apiKeyField.name')}
        desc={
          store
            ? t('settings.providers.keychainDesc')
            : t('settings.providers.apiKeyField.desc', {
                providerLabel: providerTypeInfo.label,
              })
        }
        required={providerTypeInfo.requireApiKey}
      >
        {store ? (
          <ObsidianSecretInput
            app={plugin.app}
            value={formData.apiKeySecret ?? ''}
            onChange={(name) => {
              let apiKey = ''
              try {
                apiKey = name ? (store.get(name) ?? '') : ''
              } catch {
                /* Inaccessible secrets are empty. */
              }
              setFormData((prev) => ({
                ...prev,
                apiKeySecret: name || undefined,
                apiKey,
              }))
            }}
          />
        ) : (
          <ObsidianTextInput
            value={formData.apiKey ?? ''}
            placeholder={t('settings.providers.apiKeyField.placeholder')}
            onChange={(value: string) =>
              setFormData((prev) => ({ ...prev, apiKey: value }))
            }
          />
        )}
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.providers.baseUrlField.name')}
        desc={baseUrlDesc}
        required={providerTypeInfo.requireBaseUrl}
      >
        <ObsidianTextInput
          value={formData.baseUrl ?? ''}
          placeholder={t('settings.providers.baseUrlField.placeholder')}
          onChange={(value: string) =>
            setFormData((prev) => ({ ...prev, baseUrl: value }))
          }
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.providers.tlsCaCertField.name')}
        desc={t('settings.providers.tlsCaCertField.desc')}
      >
        <ObsidianTextInput
          value={formData.tlsCaCertPath ?? ''}
          placeholder="C:\certs\internal-ca.pem"
          onChange={(value: string) =>
            setFormData((prev) => ({ ...prev, tlsCaCertPath: value }))
          }
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.providers.tlsSkipVerifyField.name')}
        desc={t('settings.providers.tlsSkipVerifyField.desc')}
      >
        <ObsidianToggle
          value={formData.tlsSkipVerify ?? false}
          onChange={(value: boolean) =>
            setFormData((prev) => ({ ...prev, tlsSkipVerify: value }))
          }
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.providers.supportsToolsField.name')}
        desc={t('settings.providers.supportsToolsField.desc')}
      >
        <ObsidianToggle
          value={formData.supportsTools ?? providerTypeInfo.supportTools}
          onChange={(value: boolean) =>
            setFormData((prev) => ({ ...prev, supportsTools: value }))
          }
        />
      </ObsidianSetting>

      <ObsidianSetting>
        <ObsidianButton
          text={
            testing
              ? t('settings.providers.testing')
              : t('settings.providers.testConnection')
          }
          onClick={(...args) => {
            void handleTestConnection(...args)
          }}
          disabled={testing}
        />
        <ObsidianButton
          text={
            previewing
              ? t('settings.chatModels.discovery.fetching')
              : t('settings.providers.previewModels.button')
          }
          onClick={(...args) => {
            void handlePreviewModels(...args)
          }}
          disabled={previewing}
        />
        <ObsidianButton
          text={provider ? t('settings.common.save') : t('settings.common.add')}
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
