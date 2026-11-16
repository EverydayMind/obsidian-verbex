import { Trash2 } from 'lucide-react'
import { App, Notice } from 'obsidian'

import { DEFAULT_EMBEDDING_MODELS } from '../../../../constants'
import { useSettings } from '../../../../contexts/settings-context'
import { getEmbeddingModelClient } from '../../../../core/rag/embedding'
import { getActiveEmbeddingModelId } from '../../../../core/rag/embeddingIndexState'
import { t } from '../../../../i18n'
import VerbexPlugin from '../../../../main'
import { ConfirmModal } from '../../../modals/ConfirmModal'
import { AddEmbeddingModelModal } from '../../modals/AddEmbeddingModelModal'

type EmbeddingModelsSubSectionProps = {
  app: App
  plugin: VerbexPlugin
}

export function EmbeddingModelsSubSection({
  app,
  plugin,
}: EmbeddingModelsSubSectionProps) {
  const { settings, setSettings } = useSettings()

  const handleDeleteEmbeddingModel = async (modelId: string) => {
    if (modelId === settings.embeddingModelId) {
      new Notice(t('settings.embeddingModels.errors.cannotRemoveSelected'))
      return
    }
    if (modelId === getActiveEmbeddingModelId(settings)) {
      new Notice(t('settings.embeddingModels.errors.cannotRemoveActive'))
      return
    }

    const message = t('settings.embeddingModels.deleteConfirm.message', {
      id: modelId,
    })

    new ConfirmModal(app, {
      title: t('settings.embeddingModels.deleteConfirm.title'),
      message: message,
      ctaText: t('settings.common.delete'),
      onConfirm: () => {
        void (async () => {
          const vectorManager = (await plugin.getDbManager()).getVectorManager()
          const embeddingStats = await vectorManager.getEmbeddingStats()
          const embeddingStat = embeddingStats.find((v) => v.model === modelId)

          if (embeddingStat?.rowCount && embeddingStat.rowCount > 0) {
            // only clear when there's data
            const embeddingModelClient = getEmbeddingModelClient({
              settings,
              embeddingModelId: modelId,
            })
            await vectorManager.clearAllVectors(embeddingModelClient)
          }

          await setSettings({
            ...settings,
            embeddingModels: [...settings.embeddingModels].filter(
              (v) => v.id !== modelId,
            ),
          })
        })()
      },
    }).open()
  }

  return (
    <div>
      <div className="verbex-settings-desc">
        {t('settings.embeddingModels.desc')}
      </div>

      <div className="verbex-settings-table-container">
        <table className="verbex-settings-table">
          <thead>
            <tr>
              <th>{t('settings.embeddingModels.table.id')}</th>
              <th>{t('settings.embeddingModels.table.providerId')}</th>
              <th>{t('settings.embeddingModels.table.model')}</th>
              <th>{t('settings.embeddingModels.table.dimension')}</th>
              <th>{t('settings.embeddingModels.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {settings.embeddingModels.map((embeddingModel) => (
              <tr key={embeddingModel.id}>
                <td>{embeddingModel.id}</td>
                <td>{embeddingModel.providerId}</td>
                <td>{embeddingModel.model}</td>
                <td>{embeddingModel.dimension}</td>
                <td>
                  <div className="verbex-settings-actions">
                    {!DEFAULT_EMBEDDING_MODELS.some(
                      (v) => v.id === embeddingModel.id,
                    ) && (
                      <button
                        onClick={() => {
                          void handleDeleteEmbeddingModel(embeddingModel.id)
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
                    new AddEmbeddingModelModal(app, plugin).open()
                  }}
                >
                  {t('settings.embeddingModels.addCustom')}
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
