import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { Loader2, PickaxeIcon, RefreshCw, Trash2 } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useState } from 'react'

import { AppProvider } from '../../../contexts/app-context'
import {
  DatabaseProvider,
  useDatabase,
} from '../../../contexts/database-context'
import {
  SettingsProvider,
  useSettings,
} from '../../../contexts/settings-context'
import { getEmbeddingModelClient } from '../../../core/rag/embedding'
import { isEmbeddingIndexAbortError } from '../../../database/modules/vector/VectorManager'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { EmbeddingDbStats } from '../../../types/embedding'
import { IndexProgress } from '../../chat-view/QueryProgress'
import { ReactModal } from '../../common/ReactModal'
import { ConfirmModal } from '../../modals/ConfirmModal'

type EmbeddingDbManagerModalComponentWrapperProps = {
  app: App
  plugin: VerbexPlugin
}

export class EmbeddingDbManageModal extends ReactModal<EmbeddingDbManagerModalComponentWrapperProps> {
  constructor(app: App, plugin: VerbexPlugin) {
    super({
      app: app,
      Component: EmbeddingDbManagerModalComponentWrapper,
      props: { app, plugin },
      options: {
        title: t('settings.rag.manageDb'),
      },
    })
    this.modalEl.addClass('verbex-embedding-db-modal')
  }
}

function EmbeddingDbManagerModalComponentWrapper({
  app,
  plugin,
}: EmbeddingDbManagerModalComponentWrapperProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 0, // Immediately garbage collect queries. It prevents memory leak on ChatView close.
      },
      mutations: {
        gcTime: 0, // Immediately garbage collect mutations. It prevents memory leak on ChatView close.
      },
    },
  })

  return (
    <AppProvider app={app}>
      <SettingsProvider
        settings={plugin.settings}
        setSettings={(newSettings) => plugin.setSettings(newSettings)}
        addSettingsChangeListener={(listener) =>
          plugin.addSettingsChangeListener(listener)
        }
      >
        <DatabaseProvider getDatabaseManager={() => plugin.getDbManager()}>
          <QueryClientProvider client={queryClient}>
            <EmbeddingDbManageModalComponent app={app} plugin={plugin} />
          </QueryClientProvider>
        </DatabaseProvider>
      </SettingsProvider>
    </AppProvider>
  )
}

function EmbeddingDbManageModalComponent({
  app,
  plugin,
}: {
  app: App
  plugin: VerbexPlugin
}) {
  const { getVectorManager } = useDatabase()
  const { settings } = useSettings()
  const [indexProgressMap, setIndexProgressMap] = useState<
    Map<string, IndexProgress>
  >(new Map())
  const isRebuildRunning = indexProgressMap.size > 0

  const {
    data: stats = [],
    isLoading,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery<EmbeddingDbStats[]>({
    queryKey: ['embedding-db-stats'],
    queryFn: async () => {
      const dbStats = await (await getVectorManager()).getEmbeddingStats()

      const statsMap = new Map(dbStats.map((stat) => [stat.model, stat]))

      return settings.embeddingModels.map((embeddingModel) => ({
        model: embeddingModel.id,
        rowCount: statsMap.get(embeddingModel.id)?.rowCount ?? 0,
        totalDataBytes: statsMap.get(embeddingModel.id)?.totalDataBytes ?? 0,
      }))
    },
  })

  const handleRebuildIndex = async (modelId: string) => {
    new ConfirmModal(app, {
      title: t('settings.rag.rebuildIndexModal.title', { model: modelId }),
      message: t('settings.rag.rebuildIndexModal.message', { model: modelId }),
      ctaText: t('settings.rag.rebuildIndexModal.cta'),
      onConfirm: () => {
        void (async () => {
          try {
            setIndexProgressMap((prev) => {
              const next = new Map(prev)
              next.set(modelId, {
                completedChunks: 0,
                totalChunks: 0,
                totalFiles: 0,
              })
              return next
            })
            await plugin.rebuildEmbeddingIndex(modelId, (progress) => {
              setIndexProgressMap((prev) => {
                const newMap = new Map(prev)
                newMap.set(modelId, progress)
                return newMap
              })
            })
          } catch (error) {
            console.error(error)
            if (
              !isEmbeddingIndexAbortError(error) ||
              (error instanceof Error && /timed?\s*out/i.test(error.message))
            ) {
              new Notice(
                `${t('settings.embeddingModels.errors.rebuildFailed')}\n${error instanceof Error ? error.message : String(error)}`,
                15000,
              )
            }
          } finally {
            setIndexProgressMap((prev) => {
              const newMap = new Map(prev)
              newMap.delete(modelId)
              return newMap
            })
            await refetch()
          }
        })()
      },
    }).open()
  }

  const handleRemoveIndex = async (modelId: string) => {
    new ConfirmModal(app, {
      title: t('settings.rag.clearIndexModal.title', { model: modelId }),
      message: t('settings.rag.clearIndexModal.message', { model: modelId }),
      ctaText: t('settings.common.delete'),
      onConfirm: () => {
        void (async () => {
          try {
            const embeddingModel = getEmbeddingModelClient({
              settings,
              embeddingModelId: modelId,
            })
            await (await getVectorManager()).clearAllVectors(embeddingModel)
          } catch (error) {
            console.error(error)
            new Notice(t('settings.embeddingModels.errors.removeFailed'))
          } finally {
            await refetch()
          }
        })()
      },
    }).open()
  }

  if (isLoading) {
    return <div>{t('settings.common.loading')}</div>
  }

  return (
    <div className="verbex-settings-embedding-db-manage-root">
      <div className="verbex-settings-embedding-db-manage-header">
        <button
          className="clickable-icon"
          aria-label={t('settings.embeddingModels.actionsAria.refresh')}
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={16} className={clsx(isFetching && 'spinner')} />
        </button>

        <span className="verbex-settings-embedding-db-manage-last-updated">
          {t('settings.common.lastUpdated', {
            time: dayjs(dataUpdatedAt).format('YYYY-MM-DD HH:mm:ss'),
          })}
        </span>
      </div>

      <table className="verbex-settings-embedding-db-manage-table">
        <thead>
          <tr>
            <th>{t('settings.embeddingModels.table.model')}</th>
            <th>{t('settings.embeddingModels.table.totalEmbeddings')}</th>
            <th>{t('settings.embeddingModels.table.sizeMb')}</th>
            <th>{t('settings.embeddingModels.table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((stat) => (
            <tr key={stat.model}>
              <td>{stat.model}</td>
              <td>{stat.rowCount}</td>
              <td>{(stat.totalDataBytes / 1024 / 1024).toFixed(2)}</td>
              {indexProgressMap.get(stat.model) ? (
                <td className="verbex-settings-embedding-db-manage-actions-loading">
                  <Loader2 className="spinner" size={14} />
                  <div>
                    {Math.round(
                      ((indexProgressMap.get(stat.model)?.completedChunks ??
                        0) /
                        Math.max(
                          indexProgressMap.get(stat.model)?.totalChunks ?? 0,
                          1,
                        )) *
                        100,
                    )}
                    %
                  </div>
                  <button
                    type="button"
                    aria-label={t(
                      'settings.embeddingModels.actionsAria.cancelRebuild',
                    )}
                    onClick={() => void plugin.cancelEmbeddingIndexRebuild()}
                  >
                    {t('settings.embeddingModels.actionsAria.cancelRebuild')}
                  </button>
                </td>
              ) : (
                <td className="verbex-settings-embedding-db-manage-actions">
                  <button
                    className="clickable-icon"
                    aria-label={t(
                      'settings.embeddingModels.actionsAria.rebuildIndex',
                    )}
                    onClick={() => void handleRebuildIndex(stat.model)}
                    disabled={isRebuildRunning}
                  >
                    <PickaxeIcon size={16} />
                  </button>
                  <button
                    className="clickable-icon"
                    aria-label={t(
                      'settings.embeddingModels.actionsAria.removeIndex',
                    )}
                    onClick={() => void handleRemoveIndex(stat.model)}
                    disabled={isRebuildRunning}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
