import { App } from 'obsidian'
import { useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { documentQueue } from '../../../core/rag/documentSources/extractionQueue'
import { shouldIndexSource } from '../../../core/rag/documentSources/indexableSources'
import { t } from '../../../i18n'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'

export function DocumentOcrControls({ app }: { app: App }) {
  const { settings, setSettings } = useSettings()
  const [path, setPath] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const options = settings.verbex.search.documents
  return (
    <>
      <ObsidianSetting
        name={t('ui.DocumentOcrControls.allowManualPDFOCR')}
        desc={t('ui.DocumentOcrControls.automaticIndexingDoesNotRunOCROnly')}
      >
        <ObsidianToggle
          value={options.ocr === 'manual'}
          onChange={(enabled) => {
            void setSettings({
              ...settings,
              verbex: {
                ...settings.verbex,
                search: {
                  ...settings.verbex.search,
                  documents: { ...options, ocr: enabled ? 'manual' : 'off' },
                },
              },
            })
          }}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name={t('ui.DocumentOcrControls.oCRThisPDF')}
        desc={t('ui.DocumentOcrControls.specifyAPDFPathWithinTheIndexing')}
      >
        <ObsidianTextInput
          value={path}
          onChange={setPath}
          placeholder={t('ui.DocumentOcrControls.attachmentsScanPdf')}
        />
        <ObsidianButton
          text={
            busy
              ? t('ui.DocumentOcrControls.runningOCR')
              : t('ui.DocumentOcrControls.oCRThisDocument')
          }
          disabled={busy || options.ocr !== 'manual' || !options.enabled}
          onClick={() => {
            void (async () => {
              const file = app.vault.getFileByPath(path)
              if (
                !file ||
                file.extension.toLowerCase() !== 'pdf' ||
                !shouldIndexSource(file, settings)
              ) {
                setStatus(
                  t('ui.DocumentOcrControls.enterAPDFPathWithinTheIndexing'),
                )
                return
              }
              setBusy(true)
              try {
                const queue = documentQueue(app)
                await queue.enqueue(file, true, 'candidates')
                const p = await queue.store.read(file.path)
                setStatus(
                  `${file.path}: ${p?.status ?? t('ui.DocumentOcrControls.noExtractedContent')} · ${p?.extractor?.ocrApplied ? t('ui.DocumentOcrControls.oCRApplied') : t('ui.DocumentOcrControls.oCRNotApplied')}`,
                )
              } catch (error) {
                setStatus(
                  error instanceof Error
                    ? error.message
                    : t('ui.DocumentOcrControls.oCRFailed'),
                )
              } finally {
                setBusy(false)
              }
            })()
          }}
        />
      </ObsidianSetting>
      <div role="status" aria-live="polite">
        {status}
      </div>
    </>
  )
}
