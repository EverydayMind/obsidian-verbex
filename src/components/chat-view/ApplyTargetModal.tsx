import { App, normalizePath } from 'obsidian'
import { useMemo, useState } from 'react'

import { t } from '../../i18n'
import { ReactModal } from '../common/ReactModal'

export type ApplyStrategy = 'replace' | 'append' | 'section'

export type ApplyTarget = {
  path: string
  /** How to combine the draft with an existing note. Always 'replace' for new notes. */
  strategy: ApplyStrategy
  sectionHeading?: string
}

type ApplyTargetModalProps = {
  initialPath: string
  existingPaths: string[]
  initialMode: 'existing' | 'new'
  initialStrategy?: ApplyStrategy
  initialSectionHeading?: string
  onSubmit: (target: ApplyTarget) => void
  onClose: () => void
}

export class ApplyTargetModal extends ReactModal<ApplyTargetModalProps> {
  constructor(
    app: App,
    options: {
      initialPath: string
      initialStrategy?: ApplyStrategy
      initialSectionHeading?: string
      onSubmit: (target: ApplyTarget) => void
    },
  ) {
    const initialPath = normalizeNotePath(options.initialPath)
    const existingPaths = app.vault
      .getMarkdownFiles()
      .map((file) => normalizePath(file.path))
    super({
      app,
      Component: ApplyTargetModalComponent,
      props: {
        initialPath,
        initialStrategy: options.initialStrategy,
        initialSectionHeading: options.initialSectionHeading,
        existingPaths,
        initialMode: existingPaths.includes(initialPath) ? 'existing' : 'new',
        onSubmit: options.onSubmit,
      },
      options: { title: t('ui.ApplyTargetModal.title') },
    })
  }
}

function normalizeNotePath(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const normalized = normalizePath(trimmed)
  return normalized.toLowerCase().endsWith('.md')
    ? normalized
    : `${normalized}.md`
}

export function ApplyTargetModalComponent({
  initialPath,
  existingPaths,
  initialMode,
  initialStrategy,
  initialSectionHeading,
  onSubmit,
  onClose,
}: ApplyTargetModalProps) {
  const [mode, setMode] = useState<'existing' | 'new'>(initialMode)
  // For existing notes, append (non-destructive) is the safe default so a short
  // draft never silently overwrites the whole note.
  const [strategy, setStrategy] = useState<ApplyStrategy>(
    initialStrategy ?? 'append',
  )
  const [path, setPath] = useState(initialPath)
  const [sectionHeading, setSectionHeading] = useState(
    initialSectionHeading ?? '',
  )
  const normalizedPath = useMemo(() => normalizeNotePath(path), [path])
  const pathExists = existingPaths.includes(normalizedPath)
  const disabled =
    normalizedPath.length === 0 ||
    (mode === 'existing' && !pathExists) ||
    (mode === 'existing' && strategy === 'section' && !sectionHeading.trim()) ||
    (mode === 'new' && pathExists)

  const submit = () => {
    if (disabled) return
    onClose()
    onSubmit({
      path: normalizedPath,
      strategy: mode === 'existing' ? strategy : 'replace',
      ...(mode === 'existing' && strategy === 'section'
        ? { sectionHeading: sectionHeading.trim() }
        : {}),
    })
  }
  return (
    <div
      className="verbex-apply-target-modal"
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          !event.nativeEvent.isComposing &&
          !disabled
        ) {
          event.preventDefault()
          submit()
        }
      }}
    >
      <label className="verbex-apply-target-label">
        {t('ui.ApplyTargetModal.mode')}
        <select
          value={mode}
          onChange={(event) =>
            setMode(event.currentTarget.value as 'existing' | 'new')
          }
        >
          <option value="existing">{t('ui.ApplyTargetModal.existing')}</option>
          <option value="new">{t('ui.ApplyTargetModal.newNote')}</option>
        </select>
      </label>
      {mode === 'existing' && (
        <label className="verbex-apply-target-label">
          {t('ui.ApplyTargetModal.how')}
          <select
            value={strategy}
            onChange={(event) =>
              setStrategy(event.currentTarget.value as ApplyStrategy)
            }
          >
            <option value="append">{t('ui.ApplyTargetModal.append')}</option>
            <option value="replace">{t('ui.ApplyTargetModal.replace')}</option>
            <option value="section">{t('ui.ApplyTargetModal.section')}</option>
          </select>
        </label>
      )}
      {mode === 'existing' && strategy === 'section' && (
        <label className="verbex-apply-target-label">
          {t('ui.ApplyTargetModal.heading')}
          <input
            value={sectionHeading}
            onChange={(event) => setSectionHeading(event.currentTarget.value)}
            placeholder={t('ui.ApplyTargetModal.headingPlaceholder')}
          />
        </label>
      )}
      <label className="verbex-apply-target-label">
        {t('ui.ApplyTargetModal.path')}
        <input
          value={path}
          onChange={(event) => setPath(event.currentTarget.value)}
          placeholder="Folder/note.md"
          list={mode === 'existing' ? 'verbex-apply-target-paths' : undefined}
          autoFocus
        />
      </label>
      {mode === 'existing' && (
        <datalist id="verbex-apply-target-paths">
          {existingPaths.map((existingPath) => (
            <option key={existingPath} value={existingPath} />
          ))}
        </datalist>
      )}
      <div className="setting-item-description">
        {mode === 'existing'
          ? pathExists
            ? strategy === 'append'
              ? t('ui.ApplyTargetModal.appendDesc')
              : strategy === 'section'
                ? t('ui.ApplyTargetModal.sectionDesc')
                : t('ui.ApplyTargetModal.replaceDesc')
            : t('ui.ApplyTargetModal.chooseExisting')
          : pathExists
            ? t('ui.ApplyTargetModal.alreadyExists')
            : t('ui.ApplyTargetModal.newDesc')}
      </div>
      <div className="modal-button-container">
        <button className="mod-cta" disabled={disabled} onClick={submit}>
          {t('ui.ToolMessage.apply')}
        </button>
        <button className="mod-cancel" onClick={onClose}>
          {t('ui.InlinePromptModal.cancel')}
        </button>
      </div>
    </div>
  )
}
