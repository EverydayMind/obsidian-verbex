import { App, Notice } from 'obsidian'
import { useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { documentStatus } from '../../../core/rag/documentSources/documentStatus'
import { documentQueue } from '../../../core/rag/documentSources/extractionQueue'
import { kordocIndexApi } from '../../../core/rag/documentSources/kordocIndexText'
import { DocumentIndexSettings as Options } from '../../../core/rag/documentSources/types'
import { t } from '../../../i18n'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextArea } from '../../common/ObsidianTextArea'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ConfirmModal } from '../../modals/ConfirmModal'
import { DocumentIndexScopeModal } from '../../modals/DocumentIndexScopeModal'

import { DocumentOcrControls } from './DocumentOcrControls'

type Props = { app: App; part?: 'basic' | 'advanced' }
export function DocumentIndexSettings({ app, part }: Props) {
  const { settings, setSettings } = useSettings()
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [toggleRevision, setToggleRevision] = useState(0)
  const options = settings.verbex.search.documents
  const embedShown =
    options.embed && options.embedConsentModelId === settings.embeddingModelId
  const update = async (patch: Partial<Options>) => {
    await setSettings({
      ...settings,
      verbex: {
        ...settings.verbex,
        search: {
          ...settings.verbex.search,
          documents: { ...options, ...patch },
        },
      },
    })
  }
  const inspect = async (retry: boolean) => {
    setBusy(true)
    try {
      const queue = documentQueue(app)
      if (retry) {
        await queue.reconcile(true)
        // Normal settings update requests both index reconciles after projections change.
        queue.notify()
      }
      const counts = await queue.stats()
      const details = await documentStatus(app, settings)
      const engine = kordocIndexApi(app)?.indexTextExtractor?.engineVersion
      setStatus(
        t('ui.DocumentIndexSettings.kORDOCLastChecked', {
          p0: engine ?? t('ui.DocumentIndexSettings.noExtractor'),
          p1: JSON.stringify(counts),
          p2: JSON.stringify(details),
          p3: queue.lastReconcile ?? t('ui.DocumentIndexSettings.none'),
        }),
      )
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : t('ui.DocumentIndexSettings.couldNotCheckExtractionStatus'),
      )
    } finally {
      setBusy(false)
    }
  }
  const basic = (
    <>
      <ObsidianSetting
        name={t('ui.DocumentIndexSettings.localHWPHWPXPDFSearch')}
        desc={t(
          'ui.DocumentIndexSettings.extractDiskDocumentsWithKORDOCAndInclude',
        )}
      >
        <ObsidianToggle
          key={`enabled-${toggleRevision}`}
          value={options.enabled}
          onChange={(enabled) => {
            void (async () => {
              if (enabled === options.enabled) return
              if (!enabled) return update({ enabled })
              setToggleRevision((revision) => revision + 1)
              new DocumentIndexScopeModal(app, (includePaths) =>
                update({ enabled: true, includePaths }),
              ).open()
            })()
          }}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name={t('ui.DocumentIndexSettings.hWPHWPXPDFEmbeddings')}
        desc={t(
          'ui.DocumentIndexSettings.sendDocumentBodiesToTheSelectedEmbedding',
        )}
      >
        <ObsidianToggle
          key={`embed-${toggleRevision}`}
          value={embedShown}
          onChange={(embed) => {
            void (async () => {
              if (embed === embedShown) return
              if (!embed) return update({ embed })
              setToggleRevision((revision) => revision + 1)
              const model = settings.embeddingModels.find(
                (m) => m.id === settings.embeddingModelId,
              )
              const local =
                model?.providerType === 'ollama' ||
                model?.providerType === 'lmstudio'
              const queue = documentQueue(app)
              const counts = await queue.stats()
              const files = app.vault
                .getFiles()
                .filter((file) => /\.(hwp|hwpx|pdf)$/i.test(file.path))
              const projections = await Promise.all(
                files.map((file) => queue.store.read(file.path)),
              )
              const chunkCount = projections.reduce(
                (n, p) => n + (p?.chunks.length ?? 0),
                0,
              )
              if (local) {
                new Notice(
                  t(
                    'ui.DocumentIndexSettings.sendDocumentBodiesToTheLocalEmbedding',
                    { p0: chunkCount },
                  ),
                )
                await update({
                  embed: true,
                  embedConsentModelId: settings.embeddingModelId,
                })
                return
              }
              new ConfirmModal(app, {
                title: t(
                  'ui.DocumentIndexSettings.consentToHWPHWPXDocumentEmbeddings',
                ),
                message: t(
                  'ui.DocumentIndexSettings.documentBodiesWillBeSentToAn',
                  { p0: JSON.stringify(counts), p1: chunkCount },
                ),
                onConfirm: () => {
                  void update({
                    embed: true,
                    embedConsentModelId: settings.embeddingModelId,
                  })
                },
              }).open()
            })()
          }}
        />
      </ObsidianSetting>
    </>
  )
  if (part === 'basic') return basic
  return (
    <>
      {part !== 'advanced' && basic}
      {(['hwp', 'hwpx', 'pdf'] as const).map((format) => (
        <ObsidianSetting
          key={format}
          name={t('ui.DocumentIndexSettings.index', {
            p0: format.toUpperCase(),
          })}
        >
          <ObsidianToggle
            value={options.formats[format]}
            onChange={(enabled) =>
              void update({
                formats: { ...options.formats, [format]: enabled },
              })
            }
          />
        </ObsidianSetting>
      ))}
      {(['includePaths', 'excludePaths'] as const).map((key) => (
        <ObsidianSetting
          key={key}
          name={
            key === 'includePaths'
              ? t('ui.DocumentIndexSettings.hWPHWPXDocumentIncludePaths')
              : t('ui.DocumentIndexSettings.hWPHWPXDocumentExcludePaths')
          }
          desc={t(
            'ui.DocumentIndexSettings.enterVaultRelativePathsOrGlobPatterns',
          )}
        >
          <ObsidianTextArea
            value={options[key].join('\n')}
            onChange={(value) =>
              void update({
                [key]: value
                  .split('\n')
                  .map((p) => p.trim())
                  .filter(Boolean),
              })
            }
          />
        </ObsidianSetting>
      ))}
      <ObsidianSetting
        name={t(
          'ui.DocumentIndexSettings.automaticHWPHWPXExtractionSizeLimitMB',
        )}
        desc={t(
          'ui.DocumentIndexSettings.documentsExceedingTheLimitRequireManualRe',
        )}
      >
        <ObsidianTextInput
          value={String(options.autoMaxBytes / 1048576)}
          onChange={(value) => {
            const size = Number(value)
            if (Number.isFinite(size) && size > 0 && size <= 100)
              void update({ autoMaxBytes: size * 1048576 })
          }}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name={t(
          'ui.DocumentIndexSettings.automaticDocumentExtractionPageLimit',
        )}
      >
        <ObsidianTextInput
          value={String(options.autoMaxPages)}
          onChange={(value) => {
            const n = Number(value)
            if (Number.isInteger(n) && n > 0) void update({ autoMaxPages: n })
          }}
        />
      </ObsidianSetting>
      <DocumentOcrControls app={app} />
      <ObsidianSetting
        name={t('ui.DocumentIndexSettings.hWPHWPXDocumentExtractionStatus')}
        desc={
          status ||
          t(
            'ui.DocumentIndexSettings.checkExtractorAvailabilityAndCountsByDocument',
          )
        }
      >
        <ObsidianButton
          text={
            busy
              ? t('ui.DocumentIndexSettings.processing')
              : t('ui.DocumentIndexSettings.checkStatus')
          }
          disabled={busy}
          onClick={() => void inspect(false)}
        />
        <ObsidianButton
          text={t('ui.DocumentIndexSettings.reExtractFailedDocuments')}
          disabled={busy || !options.enabled}
          onClick={() => void inspect(true)}
        />
      </ObsidianSetting>
      <div role="status" aria-live="polite">
        {status}
      </div>
    </>
  )
}
