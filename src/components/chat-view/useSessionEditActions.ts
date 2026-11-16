import { useState } from 'react'

import { t } from '../../i18n'
import type { SessionEditFact } from '../../provider/interop/sessionProtocol'

export function useSessionEditActions(
  fact: SessionEditFact,
  onReveal?: (fact: SessionEditFact) => Promise<{ located: boolean }>,
  onUndo?: (
    fact: SessionEditFact,
  ) => Promise<{ undone: boolean; message?: string }>,
) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [undone, setUndone] = useState(false)
  const reveal = async () => {
    if (!onReveal || busy) return
    setBusy(true)
    setNotice('')
    try {
      const r = await onReveal(fact)
      setNotice(
        r.located
          ? fact.refused
            ? t('ui.SessionEditCard.openedTheLocationThatCouldNotBe')
            : t('ui.SessionEditCard.openedTheEditedLocation')
          : t('ui.SessionEditCard.documentOpenedCheckTheCurrentDocumentFor'),
      )
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : t('ui.SessionEditCard.couldNotOpenTheDocument'),
      )
    } finally {
      setBusy(false)
    }
  }
  const undo = async () => {
    if (!onUndo || busy) return
    setBusy(true)
    setNotice('')
    try {
      const r = await onUndo(fact)
      if (r.undone) {
        setUndone(true)
        setNotice(t('ui.SessionEditCard.lastEditUndone'))
      } else
        setNotice(
          t('ui.SessionEditCard.couldNotUndo', {
            p0: r.message ?? t('ui.SessionEditCard.checkStatus'),
          }),
        )
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : t('ui.SessionEditCard.couldNotUndo2'),
      )
    } finally {
      setBusy(false)
    }
  }
  return { busy, notice, undone, reveal, undo }
}
