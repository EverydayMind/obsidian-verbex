import { useState } from 'react'

import { t } from '../../i18n'
import type { CommitFact } from '../../provider/interop/commitStatus'
import type { OutputAnchorCapture } from '../../provider/interop/outputAnchorCapture'
import type { SavedOutputAnchorPage } from '../../provider/interop/outputAnchorRead'
import type { SavedAnchorCandidate } from '../../provider/interop/resolveSavedAnchorCandidates'
import type { SavedAnchorReference } from '../../provider/interop/resolveSavedAnchorRefs'

import OutputAnchorCard from './OutputAnchorCard'

const labels = {
  pending: t('ui.CommitCard.saveResultNeedsVerification'),
  written: t('ui.CommitCard.saved'),
  not_written: t('ui.CommitCard.notSaved'),
  partial: t('ui.CommitCard.partiallySaved'),
  unknown: t('ui.CommitCard.unexpectedContents'),
  unchanged: t('ui.CommitCard.noChanges'),
}
export default function CommitCard({
  fact,
  onCheck,
  onUpdate,
  onAnchors,
  anchorCapture,
  conversationId,
  onResolveAnchors,
  onHandsCandidates,
  onRevealCandidate,
}: {
  fact: CommitFact
  onCheck: (fact: CommitFact) => Promise<CommitFact>
  onUpdate: (fact: CommitFact) => void
  onAnchors?: (
    fact: CommitFact,
  ) => Promise<
    { pages: SavedOutputAnchorPage[]; expiresAt: number } | undefined
  >
  anchorCapture?: OutputAnchorCapture
  conversationId?: string
  onResolveAnchors?: (
    fact: CommitFact,
    offset: number,
    signal: AbortSignal,
  ) => Promise<SavedAnchorReference[]>
  onHandsCandidates?: (
    fact: CommitFact,
    offset: number,
    signal: AbortSignal,
  ) => Promise<SavedAnchorCandidate[]>
  onRevealCandidate?: (
    fact: CommitFact,
    offset: number,
    blockIndex: number,
    signal: AbortSignal,
  ) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div
      className="verbex-session-edit-card"
      role="group"
      aria-label={t('ui.CommitCard.documentSaveResult')}
    >
      <strong>
        {fact.running
          ? t('ui.CommitCard.checkingSaveStatus')
          : labels[fact.state]}
      </strong>
      <div>{fact.destination}</div>
      <ul>
        {fact.entries.map((entry) => (
          <li key={entry.path}>
            {entry.path}: {labels[entry.state]}
          </li>
        ))}
      </ul>
      {fact.needsAttention && (
        <p>{t('ui.CommitCard.checkTheFileStatusSavingWillNot')}</p>
      )}
      {fact.note && <p>{fact.note}</p>}
      <button
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true)
            setError('')
            try {
              onUpdate(await onCheck(fact))
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : t('ui.CommitCard.couldNotVerifySaveStatus'),
              )
            } finally {
              setBusy(false)
            }
          })()
        }}
      >
        {busy ? t('ui.CommitCard.checking') : t('ui.CommitCard.checkResult')}
      </button>
      {error && <p role="alert">{error}</p>}
      {onAnchors && fact.state === 'written' && (
        <OutputAnchorCard
          fact={fact}
          onAnchors={onAnchors}
          anchorCapture={anchorCapture}
          conversationId={conversationId}
          onResolveAnchors={onResolveAnchors}
          onHandsCandidates={onHandsCandidates}
          onRevealCandidate={onRevealCandidate}
        />
      )}
    </div>
  )
}
