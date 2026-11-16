import { useState } from 'react'

import { t } from '../../i18n'
import type { OpenDocumentRef } from '../../provider/interop/sessionProtocol'
export type OffscreenDoc = OpenDocumentRef & { providerId: string }

export default function OffscreenUnsavedCard({
  documents,
  onOpen,
  onRequestSave,
  onDiscard,
}: {
  documents: OffscreenDoc[]
  onOpen: (doc: OffscreenDoc) => Promise<void> | void
  onRequestSave: (doc: OffscreenDoc) => void
  onDiscard: (doc: OffscreenDoc) => Promise<boolean> | boolean
}) {
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  if (!documents.length) return null

  const handleOpen = async (doc: OffscreenDoc) => {
    setBusyPath(doc.path)
    setNotice('')
    try {
      await onOpen(doc)
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : t('ui.OffscreenUnsavedCard.couldNotOpenTheDocument'),
      )
    } finally {
      setBusyPath(null)
    }
  }

  const handleDiscard = async (doc: OffscreenDoc) => {
    setBusyPath(doc.path)
    setNotice('')
    try {
      const discarded = await onDiscard(doc)
      if (discarded)
        setNotice(
          t('ui.OffscreenUnsavedCard.discardedAIChangesTo', {
            p0: doc.path.split('/').pop() ?? doc.path,
          }),
        )
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : t('ui.OffscreenUnsavedCard.couldNotDiscardChanges'),
      )
    } finally {
      setBusyPath(null)
    }
  }

  return (
    <div className="verbex-session-edit-card verbex-offscreen-unsaved-card">
      <div className="verbex-session-edit-card-title">
        {t('ui.OffscreenUnsavedCard.offscreenUnsavedDocuments')}
        {documents.length})
      </div>
      <div className="verbex-session-edit-card-note">
        {t('ui.OffscreenUnsavedCard.theWorkingCopiesEditedByAIIn')}
      </div>
      {documents.map((doc) => {
        const name = doc.path.split('/').pop() ?? doc.path
        const isBusy = busyPath === doc.path
        return (
          <div
            key={doc.path}
            className="verbex-session-edit-card-change"
            style={{ flexDirection: 'column', gap: '4px' }}
          >
            <div style={{ fontWeight: 600 }}>{name}</div>
            <div className="verbex-session-edit-card-note">{doc.path}</div>
            <div
              className="verbex-session-edit-card-actions"
              style={{ display: 'flex', gap: '8px', marginTop: '4px' }}
            >
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleOpen(doc)}
              >
                {isBusy
                  ? t('ui.OffscreenUnsavedCard.processing')
                  : t('ui.OffscreenUnsavedCard.open')}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onRequestSave(doc)}
              >
                {t('ui.OffscreenUnsavedCard.requestSave')}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleDiscard(doc)}
              >
                {t('ui.OffscreenUnsavedCard.discard')}
              </button>
            </div>
          </div>
        )
      })}
      {notice && (
        <div className="verbex-session-edit-card-note" role="status">
          {notice}
        </div>
      )}
    </div>
  )
}
