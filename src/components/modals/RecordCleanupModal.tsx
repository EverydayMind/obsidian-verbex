import { App } from 'obsidian'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  CLEANUP_TARGETS,
  CleanupItem,
  CleanupResult,
  CleanupScanOptions,
  CleanupScope,
  CleanupTarget,
  deleteStoredRecords,
  scanStoredRecords,
  selectForCleanup,
  summarize,
} from '../../core/cleanup/storedRecords'
import { t } from '../../i18n'
import { formatBytes } from '../../utils/formatBytes'
import { ReactModal } from '../common/ReactModal'

export type RecordCleanupOptions = {
  /** What is in use right now; read again before every scan. */
  loadKeep: () => Promise<Omit<CleanupScanOptions, 'now'>>
  onDeleted: (result: CleanupResult) => void | Promise<void>
  onDeleting?: () => void
}

type Props = RecordCleanupOptions & { app: App; onClose: () => void }

export class RecordCleanupModal extends ReactModal<Props> {
  constructor(app: App, options: RecordCleanupOptions) {
    super({
      app,
      Component: RecordCleanup,
      props: { app, ...options },
      options: { title: t('ui.RecordCleanupModal.title') },
    })
    this.modalEl.addClass('verbex-record-cleanup-modal')
  }
}

const SCOPES: CleanupScope[] = ['all', 7, 30, 90, 180]
/** How long the final delete button stays inert after it appears. */
export const CONFIRM_ARM_MS = 700

const targetText = (target: CleanupTarget) =>
  ({
    chats: {
      name: t('ui.RecordCleanupModal.chats'),
      desc: t('ui.RecordCleanupModal.chatsDesc'),
    },
    runs: {
      name: t('ui.RecordCleanupModal.runs'),
      desc: t('ui.RecordCleanupModal.runsDesc'),
    },
    checkpoints: {
      name: t('ui.RecordCleanupModal.checkpoints'),
      desc: t('ui.RecordCleanupModal.checkpointsDesc'),
    },
    jobs: {
      name: t('ui.RecordCleanupModal.jobs'),
      desc: t('ui.RecordCleanupModal.jobsDesc'),
    },
    backups: {
      name: t('ui.RecordCleanupModal.backups'),
      desc: t('ui.RecordCleanupModal.backupsDesc'),
    },
  })[target]

const scopeText = (scope: CleanupScope) =>
  scope === 'all'
    ? t('ui.RecordCleanupModal.scopeAll')
    : t('ui.RecordCleanupModal.scopeOlderThan', { p0: scope })

const amount = (items: readonly CleanupItem[]) => {
  const { count, bytes } = summarize(items)
  return t('ui.RecordCleanupModal.amount', {
    p0: count,
    p1: formatBytes(bytes),
  })
}

const errorText = (error: unknown) =>
  t('ui.RecordCleanupModal.scanFailed', {
    p0: error instanceof Error ? error.message : String(error),
  })

type Choice = { selected: boolean; scope: CleanupScope }
type Choices = Record<CleanupTarget, Choice>

const pick = (items: readonly CleanupItem[], choices: Choices, now: number) =>
  CLEANUP_TARGETS.flatMap((target) =>
    choices[target].selected
      ? selectForCleanup(items, target, choices[target].scope, now)
      : [],
  )

export function RecordCleanup({
  app,
  loadKeep,
  onDeleted,
  onDeleting,
  onClose,
}: Props) {
  const [items, setItems] = useState<CleanupItem[] | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [choices, setChoices] = useState<Choices>(
    () =>
      Object.fromEntries(
        CLEANUP_TARGETS.map((target) => [
          target,
          { selected: false, scope: 30 },
        ]),
      ) as Choices,
  )
  const [confirming, setConfirming] = useState(false)
  // The final button only works a moment after it appears, so a double click
  // on the first button cannot also confirm.
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const [message, setMessage] = useState<string | null>(null)

  const scan = useCallback(async () => {
    const at = Date.now()
    try {
      const found = await scanStoredRecords(app.vault.adapter, {
        ...(await loadKeep()),
        now: at,
      })
      setNow(at)
      setItems(found)
      return { found, at }
    } catch (error) {
      setItems([])
      setMessage(errorText(error))
      return null
    }
  }, [app, loadKeep])

  useEffect(() => {
    void scan()
  }, [scan])

  useEffect(() => {
    setArmed(false)
    if (!confirming) return
    const timer = window.setTimeout(() => setArmed(true), CONFIRM_ARM_MS)
    return () => window.clearTimeout(timer)
  }, [confirming])

  const chosen = useMemo(
    () => pick(items ?? [], choices, now),
    [items, choices, now],
  )

  const update = (target: CleanupTarget, next: Partial<Choice>) => {
    setConfirming(false)
    setChoices((current) => ({
      ...current,
      [target]: { ...current[target], ...next },
    }))
  }

  const remove = async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setConfirming(false)
    try {
      onDeleting?.()
      // Look again: only what is unchanged and still not in use goes.
      const fresh = await scan()
      if (!fresh) return
      const still = new Map(
        pick(fresh.found, choices, fresh.at).map((item) => [item.path, item]),
      )
      const result = await deleteStoredRecords(
        app.vault.adapter,
        chosen.flatMap((item) => {
          const current = still.get(item.path)
          return current?.mtime === item.mtime ? [current] : []
        }),
      )
      const left = chosen.length - result.deleted.length
      setMessage(
        left > 0
          ? t('ui.RecordCleanupModal.doneWithLeftovers', {
              p0: amount(result.deleted),
              p1: left,
            })
          : t('ui.RecordCleanupModal.done', { p0: amount(result.deleted) }),
      )
      await onDeleted(result)
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      await scan()
      running.current = false
      setBusy(false)
    }
  }

  if (!items) return <div>{t('ui.RecordCleanupModal.scanning')}</div>

  const kept = items.filter((item) => item.keep).length
  return (
    <div className="verbex-record-cleanup">
      <p>{t('ui.RecordCleanupModal.intro')}</p>
      {CLEANUP_TARGETS.map((target) => {
        const all = items.filter((item) => item.target === target)
        const choice = choices[target]
        const text = targetText(target)
        const picked = selectForCleanup(items, target, choice.scope, now)
        return (
          <div className="verbex-record-cleanup-row" key={target}>
            <label className="verbex-record-cleanup-target">
              <input
                type="checkbox"
                checked={choice.selected}
                disabled={busy || all.length === 0}
                onChange={(event) =>
                  update(target, { selected: event.target.checked })
                }
              />
              <span>
                <strong>{text.name}</strong>
                <span className="verbex-record-cleanup-desc">{text.desc}</span>
                <span className="verbex-record-cleanup-count">
                  {t('ui.RecordCleanupModal.stored', { p0: amount(all) })}
                  {choice.selected
                    ? ` → ${t('ui.RecordCleanupModal.willDelete', { p0: amount(picked) })}`
                    : ''}
                </span>
              </span>
            </label>
            <select
              className="dropdown"
              aria-label={t('ui.RecordCleanupModal.scope', { p0: text.name })}
              value={String(choice.scope)}
              disabled={busy || all.length === 0}
              onChange={(event) =>
                update(target, {
                  scope:
                    event.target.value === 'all'
                      ? 'all'
                      : Number(event.target.value),
                })
              }
            >
              {SCOPES.map((scope) => (
                <option key={String(scope)} value={String(scope)}>
                  {scopeText(scope)}
                </option>
              ))}
            </select>
          </div>
        )
      })}
      <p className="verbex-record-cleanup-note">
        {t('ui.RecordCleanupModal.keptNote', { p0: kept })}
      </p>
      {message ? (
        <p className="verbex-record-cleanup-message" role="status">
          {message}
        </p>
      ) : null}
      {confirming ? (
        <p className="verbex-record-cleanup-confirm" role="alert">
          {t('ui.RecordCleanupModal.confirm', { p0: amount(chosen) })}
        </p>
      ) : null}
      {confirming ? (
        // Cancel takes the place the first button had, and the focus.
        <div className="modal-button-container" key="confirm">
          <button
            className="mod-cancel"
            autoFocus
            onClick={() => setConfirming(false)}
          >
            {t('settings.common.cancel')}
          </button>
          <button
            className="mod-warning"
            disabled={!armed}
            onClick={() => void remove()}
          >
            {t('ui.RecordCleanupModal.deleteForever')}
          </button>
        </div>
      ) : (
        <div className="modal-button-container" key="choose">
          <button
            className="mod-warning"
            disabled={busy || chosen.length === 0}
            onClick={() => setConfirming(true)}
          >
            {busy
              ? t('ui.RecordCleanupModal.deleting')
              : t('ui.RecordCleanupModal.delete', { p0: amount(chosen) })}
          </button>
          <button className="mod-cancel" disabled={busy} onClick={onClose}>
            {t('ui.RecordCleanupModal.close')}
          </button>
        </div>
      )}
    </div>
  )
}
