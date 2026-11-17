import { App } from 'obsidian'

import {
  LOCAL_E5_FP16_MODEL_ID,
  RECOMMENDED_MODELS_FOR_EMBEDDING,
} from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { findFilesMatchingPatterns } from '../../../utils/glob-utils'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextArea } from '../../common/ObsidianTextArea'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { EmbeddingDbManageModal } from '../modals/EmbeddingDbManageModal'
import { ExcludedFilesModal } from '../modals/ExcludedFilesModal'
import { IncludedFilesModal } from '../modals/IncludedFilesModal'
import { RetrievalEvaluationCollectorModal } from '../modals/RetrievalEvaluationCollectorModal'

import { DocumentIndexSettings } from './DocumentIndexSettings'

type RAGSectionProps = {
  app: App
  plugin: VerbexPlugin
}

export function RAGSection({ app, plugin }: RAGSectionProps) {
  const { settings, setSettings } = useSettings()

  return (
    <div className="verbex-settings-section">
      <DocumentIndexSettings app={app} />
      <div className="verbex-settings-header">{t('settings.rag.title')}</div>

      <ObsidianSetting
        name={t('settings.rag.embeddingModel.name')}
        desc={t('settings.rag.embeddingModel.desc')}
      >
        <ObsidianDropdown
          value={settings.embeddingModelId}
          options={Object.fromEntries(
            settings.embeddingModels.map((embeddingModel) => [
              embeddingModel.id,
              `${embeddingModel.id}${embeddingModel.id === LOCAL_E5_FP16_MODEL_ID && !plugin.isLocalEmbeddingRuntimeInstalled() ? ` (${t('settings.common.offlinePackRequired')})` : RECOMMENDED_MODELS_FOR_EMBEDDING.includes(embeddingModel.id) ? ` (${t('settings.common.recommended')})` : ''}`,
            ]),
          )}
          onChange={(value) => {
            void (async () => {
              await setSettings({
                ...settings,
                embeddingModelId: value,
              })
            })()
          }}
        />
      </ObsidianSetting>

      {settings.embeddingModelId === LOCAL_E5_FP16_MODEL_ID && (
        <ObsidianSetting
          name={t('settings.rag.localEmbeddingDevice.name')}
          desc={t('settings.rag.localEmbeddingDevice.desc')}
        >
          <ObsidianDropdown
            value={settings.localEmbeddingDevice}
            options={{ cpu: 'CPU', webgpu: 'WebGPU' }}
            onChange={(value) => {
              void (async () => {
                if (value !== 'cpu' && value !== 'webgpu') return
                await setSettings({ ...settings, localEmbeddingDevice: value })
              })()
            }}
          />
        </ObsidianSetting>
      )}

      <ObsidianSetting
        name={t('settings.rag.includePatterns.name')}
        desc={t('settings.rag.includePatterns.desc')}
      >
        <ObsidianButton
          text={t('settings.rag.testPatterns')}
          onClick={() => {
            void (async () => {
              const patterns = settings.ragOptions.includePatterns
              const includedFiles = await findFilesMatchingPatterns(
                patterns,
                plugin.app.vault,
              )
              new IncludedFilesModal(app, includedFiles, patterns).open()
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting className="verbex-settings-textarea">
        <ObsidianTextArea
          value={settings.ragOptions.includePatterns.join('\n')}
          onChange={(value: string) => {
            void (async () => {
              const patterns = value
                .split('\n')
                .map((p: string) => p.trim())
                .filter((p: string) => p.length > 0)
              await setSettings({
                ...settings,
                ragOptions: {
                  ...settings.ragOptions,
                  includePatterns: patterns,
                },
              })
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.rag.excludePatterns.name')}
        desc={t('settings.rag.excludePatterns.desc')}
      >
        <ObsidianButton
          text={t('settings.rag.testPatterns')}
          onClick={() => {
            void (async () => {
              const patterns = settings.ragOptions.excludePatterns
              const excludedFiles = await findFilesMatchingPatterns(
                patterns,
                plugin.app.vault,
              )
              new ExcludedFilesModal(app, excludedFiles).open()
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting className="verbex-settings-textarea">
        <ObsidianTextArea
          value={settings.ragOptions.excludePatterns.join('\n')}
          onChange={(value) => {
            void (async () => {
              const patterns = value
                .split('\n')
                .map((p) => p.trim())
                .filter((p) => p.length > 0)
              await setSettings({
                ...settings,
                ragOptions: {
                  ...settings.ragOptions,
                  excludePatterns: patterns,
                },
              })
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.rag.chunkSize.name')}
        desc={t('settings.rag.chunkSize.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.chunkSize)}
          placeholder="1000"
          onChange={(value) => {
            void (async () => {
              const chunkSize = parseInt(value, 10)
              if (!isNaN(chunkSize)) {
                await setSettings({
                  ...settings,
                  ragOptions: {
                    ...settings.ragOptions,
                    chunkSize,
                  },
                })
              }
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.rag.thresholdTokens.name')}
        desc={t('settings.rag.thresholdTokens.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.thresholdTokens)}
          placeholder="8192"
          onChange={(value) => {
            void (async () => {
              const thresholdTokens = parseInt(value, 10)
              if (!isNaN(thresholdTokens)) {
                await setSettings({
                  ...settings,
                  ragOptions: {
                    ...settings.ragOptions,
                    thresholdTokens,
                  },
                })
              }
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.rag.minSimilarity.name')}
        desc={t('settings.rag.minSimilarity.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.minSimilarity)}
          placeholder="0.0"
          onChange={(value) => {
            void (async () => {
              // Allow decimal point and numbers only
              if (!/^[0-9.]*$/.test(value)) return

              // Ignore typing decimal point to prevent interference with the input
              if (value === '.' || value.endsWith('.')) return

              const minSimilarity = parseFloat(value)
              if (!isNaN(minSimilarity)) {
                await setSettings({
                  ...settings,
                  ragOptions: {
                    ...settings.ragOptions,
                    minSimilarity,
                  },
                })
              }
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.rag.bm25Weight.name')}
        desc={t('settings.rag.bm25Weight.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.bm25Weight)}
          placeholder="0.3"
          onChange={(value) => {
            void (async () => {
              // Allow decimal point and numbers only
              if (!/^[0-9.]*$/.test(value)) return

              // Ignore typing decimal point to prevent interference with the input
              if (value === '.' || value.endsWith('.')) return

              const bm25Weight = parseFloat(value)
              if (!isNaN(bm25Weight) && bm25Weight >= 0 && bm25Weight <= 1) {
                await setSettings({
                  ...settings,
                  ragOptions: {
                    ...settings.ragOptions,
                    bm25Weight,
                  },
                })
              }
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.rag.limit.name')}
        desc={t('settings.rag.limit.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.limit)}
          placeholder="10"
          onChange={(value) => {
            void (async () => {
              const limit = parseInt(value, 10)
              if (!isNaN(limit)) {
                await setSettings({
                  ...settings,
                  ragOptions: {
                    ...settings.ragOptions,
                    limit,
                  },
                })
              }
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.rag.linkedMarkdownFiles.name')}
        desc={t('settings.rag.linkedMarkdownFiles.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.linkedMarkdownFileLimit)}
          placeholder="10"
          onChange={(value) => {
            void (async () => {
              const linkedMarkdownFileLimit = parseInt(value, 10)
              if (
                !isNaN(linkedMarkdownFileLimit) &&
                linkedMarkdownFileLimit >= 0
              ) {
                await setSettings({
                  ...settings,
                  ragOptions: {
                    ...settings.ragOptions,
                    linkedMarkdownFileLimit,
                  },
                })
              }
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.rag.linkedMarkdownDepth.name')}
        desc={t('settings.rag.linkedMarkdownDepth.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.linkedMarkdownDepth)}
          placeholder="1"
          onChange={(value) => {
            void (async () => {
              const linkedMarkdownDepth = parseInt(value, 10)
              if (!isNaN(linkedMarkdownDepth) && linkedMarkdownDepth >= 0) {
                await setSettings({
                  ...settings,
                  ragOptions: {
                    ...settings.ragOptions,
                    linkedMarkdownDepth,
                  },
                })
              }
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.rag.expandGraph.name')}
        desc={t('settings.rag.expandGraph.desc')}
      >
        <ObsidianToggle
          value={settings.ragOptions.expandGraph}
          onChange={(value) => {
            void (async () => {
              await setSettings({
                ...settings,
                ragOptions: {
                  ...settings.ragOptions,
                  expandGraph: value,
                },
              })
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting name={t('settings.rag.manageDb')}>
        <ObsidianButton
          text={t('settings.common.manage')}
          onClick={() => {
            void (async () => {
              new EmbeddingDbManageModal(app, plugin).open()
            })()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('ui.RAGSection.collectRetrievalEvaluationData')}
        desc={t('ui.RAGSection.markRealVaultQueriesAndRelevantEvidence')}
      >
        <ObsidianButton
          text={t('ui.RAGSection.openCollector')}
          onClick={() => {
            void (async () => {
              new RetrievalEvaluationCollectorModal(app, plugin).open()
            })()
          }}
        />
      </ObsidianSetting>
    </div>
  )
}
