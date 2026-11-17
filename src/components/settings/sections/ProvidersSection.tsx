import { Settings, Trash2 } from 'lucide-react'
import { App } from 'obsidian'
import React from 'react'

import {
  DEFAULT_PROVIDERS,
  PLAN_PROVIDER_TYPES,
  PROVIDER_TYPES_INFO,
} from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import { invalidateModelDiscoveryCache } from '../../../core/llm/modelDiscovery'
import {
  cleanupChatModelReferences,
  cleanupEmbeddingModelReference,
} from '../../../core/llm/modelReadiness'
import { getEmbeddingModelClient } from '../../../core/rag/embedding'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { LLMProvider } from '../../../types/provider.types'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  AddProviderModal,
  EditProviderModal,
} from '../modals/ProviderFormModal'

type ProvidersSectionProps = {
  app: App
  plugin: VerbexPlugin
}

export function ProvidersSection({ app, plugin }: ProvidersSectionProps) {
  const { settings, setSettings } = useSettings()
  const apiProviders = settings.providers.filter(
    (p) => !PLAN_PROVIDER_TYPES.includes(p.type),
  )

  const handleDeleteProvider = async (provider: LLMProvider) => {
    // Get associated models
    const associatedChatModels = settings.chatModels.filter(
      (m) => m.providerId === provider.id,
    )
    const associatedEmbeddingModels = settings.embeddingModels.filter(
      (m) => m.providerId === provider.id,
    )

    const message = t('settings.providers.deleteConfirm.message', {
      id: provider.id,
      chatCount: associatedChatModels.length,
      embedCount: associatedEmbeddingModels.length,
    })

    new ConfirmModal(app, {
      title: t('settings.providers.deleteConfirm.title'),
      message: message,
      ctaText: t('settings.common.delete'),
      onConfirm: () => {
        void (async () => {
          const vectorManager = (await plugin.getDbManager()).getVectorManager()
          const embeddingStats = await vectorManager.getEmbeddingStats()

          // Clear embeddings for each associated embedding model
          for (const embeddingModel of associatedEmbeddingModels) {
            const embeddingStat = embeddingStats.find(
              (v) => v.model === embeddingModel.id,
            )

            if (embeddingStat?.rowCount && embeddingStat.rowCount > 0) {
              // only clear when there's data
              const embeddingModelClient = getEmbeddingModelClient({
                settings,
                embeddingModelId: embeddingModel.id,
              })
              await vectorManager.clearAllVectors(embeddingModelClient)
            }
          }

          const remainingEmbeddingModels = settings.embeddingModels.filter(
            (v) => v.providerId !== provider.id,
          )
          const cleanedChat = cleanupChatModelReferences(
            settings,
            new Set(associatedChatModels.map((m) => m.id)),
          )
          const embeddingModelId = cleanupEmbeddingModelReference(
            remainingEmbeddingModels,
            settings.embeddingModelId,
            new Set(associatedEmbeddingModels.map((m) => m.id)),
          )

          await setSettings({
            ...settings,
            ...cleanedChat,
            embeddingModelId,
            providers: [...settings.providers].filter(
              (v) => v.id !== provider.id,
            ),
            chatModels: [...settings.chatModels].filter(
              (v) => v.providerId !== provider.id,
            ),
            embeddingModels: remainingEmbeddingModels,
          })
          invalidateModelDiscoveryCache(plugin.modelDiscoveryCache, provider.id)
        })()
      },
    }).open()
  }

  return (
    <div className="verbex-settings-section">
      <div className="verbex-settings-header">
        {t('settings.providers.title')}
      </div>

      <div className="verbex-settings-desc">
        <span>{t('settings.providers.desc')}</span>
      </div>

      <div className="verbex-settings-table-container">
        <table className="verbex-settings-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col width={80} />
            <col width={60} />
          </colgroup>
          <thead>
            <tr>
              <th>{t('settings.providers.table.id')}</th>
              <th>{t('settings.providers.table.type')}</th>
              <th>{t('settings.providers.table.apiKey')}</th>
              <th>{t('settings.providers.table.tools')}</th>
              <th>{t('settings.providers.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {apiProviders.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.id}</td>
                <td>{PROVIDER_TYPES_INFO[provider.type].label}</td>
                <td
                  className="verbex-settings-table-api-key"
                  onClick={() => {
                    new EditProviderModal(app, plugin, provider).open()
                  }}
                >
                  {provider.apiKeySecret
                    ? t(
                        provider.apiKey
                          ? 'settings.providers.keychainValue'
                          : 'settings.providers.keychainEmpty',
                        { name: provider.apiKeySecret },
                      )
                    : provider.apiKey
                      ? '••••••••'
                      : t('settings.providers.table.setApiKey')}
                </td>
                <td>
                  {(provider.supportsTools ??
                  PROVIDER_TYPES_INFO[provider.type].supportTools)
                    ? t('settings.common.on')
                    : t('settings.common.off')}
                </td>
                <td>
                  <div className="verbex-settings-actions">
                    <button
                      onClick={() => {
                        new EditProviderModal(app, plugin, provider).open()
                      }}
                      className="clickable-icon"
                    >
                      <Settings />
                    </button>
                    {!DEFAULT_PROVIDERS.some((v) => v.id === provider.id) && (
                      <button
                        onClick={() => {
                          void handleDeleteProvider(provider)
                        }}
                        className="clickable-icon"
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>
                <button
                  onClick={() => {
                    new AddProviderModal(app, plugin).open()
                  }}
                >
                  {t('settings.providers.addCustom')}
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
