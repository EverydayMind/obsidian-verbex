import { t } from '../../i18n'
import type { SessionEditFact } from '../../provider/interop/sessionProtocol'

import { sessionEditCardModel } from './sessionEditCardModel'
import { useSessionEditActions } from './useSessionEditActions'

export { MAX_CARD_CHANGES, sessionEditCardModel } from './sessionEditCardModel'

export default function SessionEditCard({
  fact,
  onReveal,
  onUndo,
}: {
  fact: SessionEditFact
  onReveal?: (fact: SessionEditFact) => Promise<{ located: boolean }>
  onUndo?: (
    fact: SessionEditFact,
  ) => Promise<{ undone: boolean; message?: string }>
}) {
  const model = sessionEditCardModel(fact)
  const { busy, notice, undone, reveal, undo } = useSessionEditActions(
    fact,
    onReveal,
    onUndo,
  )
  return (
    <div className="verbex-session-edit-card">
      <div className="verbex-session-edit-card-title" title={fact.path}>
        {model.title}
      </div>
      {model.changes.map((c, index) => (
        <div className="verbex-session-edit-card-change" key={index}>
          <div className="verbex-session-edit-card-before">{c.before}</div>
          <div className="verbex-session-edit-card-after">{c.after}</div>
        </div>
      ))}
      {model.more > 0 && (
        <div className="verbex-session-edit-card-note">
          {t('ui.SessionEditCard.andMoreLocations', { p0: model.more })}
        </div>
      )}
      {model.notes.map((n) => (
        <div className="verbex-session-edit-card-note" key={n}>
          {n}
        </div>
      ))}
      <div
        className="verbex-session-edit-card-actions"
        style={{ display: 'flex', gap: '8px' }}
      >
        {onReveal && (
          <button type="button" disabled={busy} onClick={() => void reveal()}>
            {busy
              ? t('ui.SessionEditCard.processing')
              : fact.visible === false
                ? t('ui.SessionEditCard.open')
                : t('ui.SessionEditCard.viewLocation')}
          </button>
        )}
        {onUndo && !fact.refused && fact.undoAvailable && !undone && (
          <button type="button" disabled={busy} onClick={() => void undo()}>
            {busy
              ? t('ui.SessionEditCard.processing2')
              : t('ui.SessionEditCard.undo')}
          </button>
        )}
      </div>
      {notice && (
        <div className="verbex-session-edit-card-note" role="status">
          {notice}
        </div>
      )}
    </div>
  )
}
