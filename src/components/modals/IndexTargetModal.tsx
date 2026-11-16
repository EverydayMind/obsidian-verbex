import { App } from 'obsidian'
import { useMemo, useState } from 'react'

import { t } from '../../i18n'
import { ReactModal } from '../common/ReactModal'

export type IndexTargetProbe = { noteCount: number; hasChecklist: boolean }
export type WikiTargetProbe = IndexTargetProbe

export type IndexTargetChoice = {
  indexFolder: string
  wikiFolder: string
  mode: 'build' | 'rebuild' | 'reuse'
}
export type WikiTargetChoice = IndexTargetChoice

export type IndexTargetModalOptions = {
  proposedFolder: string
  sourceLabel: string
  probeFolder: (folder: string) => IndexTargetProbe
  onSubmit: (choice: IndexTargetChoice) => void
  onCancel?: () => void
  title?: string
  prompt?: string
  placeholder?: string
  reuseLabel?: string
  buildLabel?: string
}
export type WikiTargetModalOptions = IndexTargetModalOptions

type IndexTargetModalComponentProps = Omit<
  IndexTargetModalOptions,
  'onCancel'
> & {
  onCancel?: () => void
  onClose: () => void
}

export class IndexTargetModal extends ReactModal<IndexTargetModalComponentProps> {
  constructor(app: App, options: IndexTargetModalOptions) {
    super({
      app: app,
      Component: IndexTargetModalComponent,
      props: {
        proposedFolder: options.proposedFolder,
        sourceLabel: options.sourceLabel,
        probeFolder: options.probeFolder,
        onSubmit: options.onSubmit,
        onCancel: options.onCancel,
        title: options.title,
        prompt: options.prompt,
        placeholder: options.placeholder,
        reuseLabel: options.reuseLabel,
        buildLabel: options.buildLabel,
      },
      options: {
        title: options.title || t('ui.IndexTargetModal.confirmWorkingFolder'),
      },
    })
  }
}
export class WikiTargetModal extends IndexTargetModal {}

function IndexTargetModalComponent({
  proposedFolder,
  sourceLabel,
  probeFolder,
  onSubmit,
  onCancel,
  onClose,
  prompt,
  placeholder,
  reuseLabel,
  buildLabel,
}: IndexTargetModalComponentProps) {
  const [folder, setFolder] = useState(proposedFolder)
  const trimmed = folder.trim().replace(/\/$/, '')
  const probe = useMemo(
    () =>
      trimmed ? probeFolder(trimmed) : { noteCount: 0, hasChecklist: false },
    [probeFolder, trimmed],
  )

  const submit = (mode: IndexTargetChoice['mode']) => {
    if (!trimmed) return
    onClose()
    onSubmit({ indexFolder: trimmed, wikiFolder: trimmed, mode })
  }

  const statusText = !trimmed
    ? t('ui.IndexTargetModal.enterAFolderPathToWorkIn')
    : probe.hasChecklist
      ? t('ui.IndexTargetModal.thisFolderHasAnExistingIndexWiki', {
          p0: probe.noteCount,
        })
      : probe.noteCount > 0
        ? t('ui.IndexTargetModal.thisFolderHasNotesButNoChecklist', {
            p0: probe.noteCount,
          })
        : t('ui.IndexTargetModal.thisFolderIsEmptyOrNewA')

  const displayPrompt =
    prompt ||
    t('ui.IndexTargetModal.whereShouldTheReviewFolderForGo', {
      p0: sourceLabel,
    })
  const displayPlaceholder =
    placeholder || t('ui.IndexTargetModal.exampleIndexWorkingFolder')

  return (
    <div>
      <div style={{ whiteSpace: 'pre-wrap', marginBottom: 'var(--size-4-2)' }}>
        {displayPrompt}
      </div>
      <input
        type="text"
        value={folder}
        onChange={(event) => setFolder(event.target.value)}
        placeholder={displayPlaceholder}
        style={{ width: '100%' }}
      />
      <div
        style={{
          whiteSpace: 'pre-wrap',
          marginTop: 'var(--size-4-2)',
          color: 'var(--text-muted)',
        }}
      >
        {statusText}
      </div>
      <div className="modal-button-container">
        {probe.hasChecklist && (
          <button className="mod-cta" onClick={() => submit('reuse')}>
            {reuseLabel || t('ui.IndexTargetModal.reuseExistingIndex')}
          </button>
        )}
        <button
          className={probe.hasChecklist ? 'mod-warning' : 'mod-cta'}
          disabled={!trimmed}
          onClick={() => submit(probe.noteCount > 0 ? 'rebuild' : 'build')}
        >
          {buildLabel ||
            (probe.noteCount > 0
              ? t('ui.IndexTargetModal.rebuildRegenerate')
              : t('ui.IndexTargetModal.buildNewIndex'))}
        </button>
        <button
          className="mod-cancel"
          onClick={() => {
            onClose()
            onCancel?.()
          }}
        >
          {t('ui.IndexTargetModal.cancel')}
        </button>
      </div>
    </div>
  )
}
