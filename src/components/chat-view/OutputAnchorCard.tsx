import { useEffect, useRef, useState } from 'react'

import { t } from '../../i18n'
import type { CommitFact } from '../../provider/interop/commitStatus'
import type { OutputAnchorCapture } from '../../provider/interop/outputAnchorCapture'
import type { SavedOutputAnchorPage } from '../../provider/interop/outputAnchorRead'
import type { SavedAnchorCandidate } from '../../provider/interop/resolveSavedAnchorCandidates'
import type { SavedAnchorReference } from '../../provider/interop/resolveSavedAnchorRefs'

type Observation = { pages: SavedOutputAnchorPage[]; expiresAt: number }
export default function OutputAnchorCard({
  fact,
  onAnchors,
  anchorCapture,
  conversationId,
  onResolveAnchors,
  onHandsCandidates,
  onRevealCandidate,
}: {
  fact: CommitFact
  onAnchors: (fact: CommitFact) => Promise<Observation | undefined>
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
  const [observation, setObservation] = useState<Observation | null>(null)
  const [page, setPage] = useState(0)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [refBusy, setRefBusy] = useState<'kordoc' | 'hands' | 'reveal' | null>(
    null,
  )
  const [refs, setRefs] = useState<SavedAnchorReference[] | null>(null)
  const [candidates, setCandidates] = useState<SavedAnchorCandidate[] | null>(
    null,
  )
  const [candidateNotice, setCandidateNotice] = useState('')
  const [refNotice, setRefNotice] = useState('')
  const controller = useRef<AbortController | null>(null)
  const rows = observation?.pages.flatMap((item) => item.anchors) ?? []
  useEffect(() => {
    if (!observation) return
    const timer = setTimeout(
      () => {
        controller.current?.abort()
        setRefs(null)
        setCandidates(null)
        setObservation(null)
      },
      Math.max(0, observation.expiresAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [observation])
  useEffect(
    () =>
      anchorCapture?.subscribe(() => {
        if (!conversationId || !anchorCapture.requested(conversationId)) {
          controller.current?.abort()
          setRefs(null)
          setCandidates(null)
          setObservation(null)
        }
      }),
    [anchorCapture, conversationId],
  )
  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )
  return (
    <div>
      <button
        type="button"
        disabled={busy || !!refBusy}
        onClick={() => {
          void (async () => {
            setBusy(true)
            setNotice('')
            setObservation(null)
            setRefs(null)
            setCandidates(null)
            setCandidateNotice('')
            setRefNotice('')
            setPage(0)
            const generation =
              conversationId && anchorCapture?.requested(conversationId)
            try {
              const found = await onAnchors(fact)
              if (
                found &&
                (!anchorCapture ||
                  (conversationId &&
                    generation &&
                    anchorCapture.requested(conversationId) === generation)) &&
                found.expiresAt > Date.now()
              )
                setObservation(found)
              else
                setNotice(
                  t(
                    'ui.OutputAnchorCard.noParagraphLocationRecordsAreAvailableFor',
                  ),
                )
            } catch {
              setNotice(
                t('ui.OutputAnchorCard.couldNotCheckParagraphLocationRecords'),
              )
            } finally {
              setBusy(false)
            }
          })()
        }}
      >
        {busy
          ? t('ui.OutputAnchorCard.checkingLocations')
          : t('ui.OutputAnchorCard.viewParagraphLocationsAtSaveTime')}
      </button>
      {notice && <p role="status">{notice}</p>}
      {observation && (
        <div>
          <p>{t('ui.OutputAnchorCard.partialObservationsAtSaveTimeTheFile')}</p>
          {onResolveAnchors && rows.length > 0 && (
            <div>
              <button
                type="button"
                disabled={!!refBusy}
                onClick={() => {
                  void (async () => {
                    const active = new AbortController()
                    controller.current = active
                    setRefBusy('kordoc')
                    setRefs(null)
                    setRefNotice('')
                    try {
                      const result = await onResolveAnchors(
                        fact,
                        page * 50,
                        active.signal,
                      )
                      if (
                        !active.signal.aborted &&
                        observation.expiresAt > Date.now()
                      )
                        setRefs(result)
                    } catch {
                      if (!active.signal.aborted)
                        setRefNotice(
                          t(
                            'ui.OutputAnchorCard.couldNotVerifyKORDOCReferencesCheckFile',
                          ),
                        )
                    } finally {
                      if (controller.current === active) {
                        controller.current = null
                        setRefBusy(null)
                      }
                    }
                  })()
                }}
              >
                {refBusy === 'kordoc'
                  ? t('ui.OutputAnchorCard.checkingKORDOC')
                  : t(
                      'ui.OutputAnchorCard.verifyKORDOCReferencesForThisLocation',
                    )}
              </button>
              {refNotice && <p role="status">{refNotice}</p>}
              {refs && (
                <p>
                  {t('ui.OutputAnchorCard.referencesReflectTheTimeOfTheKORDOC')}
                </p>
              )}
            </div>
          )}
          {onHandsCandidates && rows.length > 0 && (
            <div>
              <button
                type="button"
                disabled={!!refBusy}
                onClick={() => {
                  void (async () => {
                    const active = new AbortController()
                    controller.current = active
                    setRefBusy('hands')
                    setCandidates(null)
                    setCandidateNotice('')
                    try {
                      const result = await onHandsCandidates(
                        fact,
                        page * 50,
                        active.signal,
                      )
                      if (
                        !active.signal.aborted &&
                        observation.expiresAt > Date.now()
                      )
                        setCandidates(result)
                    } catch {
                      if (!active.signal.aborted)
                        setCandidateNotice(
                          t(
                            'ui.OutputAnchorCard.couldNotCheckParagraphCandidatesInThe',
                          ),
                        )
                    } finally {
                      if (controller.current === active) {
                        controller.current = null
                        setRefBusy(null)
                      }
                    }
                  })()
                }}
              >
                {refBusy === 'hands'
                  ? t('ui.OutputAnchorCard.checkingDocument')
                  : t(
                      'ui.OutputAnchorCard.checkParagraphCandidatesInOpenHWPHands',
                    )}
              </button>
              {candidateNotice && <p role="status">{candidateNotice}</p>}
              {candidates && (
                <p>
                  {t(
                    'ui.OutputAnchorCard.candidatesReflectTheOpenDocumentAtCheck',
                  )}
                </p>
              )}
            </div>
          )}
          <p>
            {rows.length}
            {t('ui.OutputAnchorCard.locationS')}
            {observation.pages.at(-1)?.nextOffset !== null
              ? t('ui.OutputAnchorCard.partiallyCollected')
              : ''}
          </p>
          <ul>
            {rows.slice(page * 50, (page + 1) * 50).map((row) => {
              const ref = refs?.find(
                (item) => item.blockIndex === row.blockIndex,
              )
              const candidate = candidates?.find(
                (item) => item.blockIndex === row.blockIndex,
              )
              return (
                <li key={row.blockIndex}>
                  {t('ui.OutputAnchorCard.conversionBlock')}
                  {row.blockIndex} {t('ui.OutputAnchorCard.bodyParagraph')}
                  {row.paragraph}
                  {'appliedMarker' in row &&
                    ` · ${typeof row.appliedMarker === 'string' ? row.appliedMarker : '—'}`}
                  {'requestedVariant' in row &&
                    typeof row.requestedVariant === 'string' &&
                    t('ui.OutputAnchorCard.requestedVariant', {
                      p0: row.requestedVariant,
                      p1:
                        'variantMissing' in row && row.variantMissing
                          ? t('ui.OutputAnchorCard.noRule')
                          : '',
                    })}
                  {ref &&
                    (ref.state === 'matched'
                      ? ` → KORDOC ${ref.ref}`
                      : t('ui.OutputAnchorCard.noKORDOCReference'))}
                  {candidate &&
                    (candidate.state === 'candidate'
                      ? t('ui.OutputAnchorCard.hWPHandsCandidateRevision', {
                          p0: candidate.address.revision,
                        })
                      : t('ui.OutputAnchorCard.noHWPHandsCandidate'))}
                  {candidate?.state === 'candidate' && onRevealCandidate && (
                    <button
                      type="button"
                      disabled={!!refBusy}
                      aria-label={t(
                        'ui.OutputAnchorCard.viewLocationOfConversionBlock',
                        { p0: row.blockIndex },
                      )}
                      onClick={() => {
                        void (async () => {
                          const active = new AbortController()
                          controller.current = active
                          setRefBusy('reveal')
                          setCandidateNotice('')
                          try {
                            await onRevealCandidate(
                              fact,
                              page * 50,
                              row.blockIndex,
                              active.signal,
                            )
                            if (!active.signal.aborted)
                              setCandidateNotice(
                                t(
                                  'ui.OutputAnchorCard.checkTheLocationInTheHWPHands',
                                ),
                              )
                          } catch {
                            if (!active.signal.aborted)
                              setCandidateNotice(
                                t(
                                  'ui.OutputAnchorCard.couldNotConfirmNavigationCheckTheDocument',
                                ),
                              )
                          } finally {
                            if (controller.current === active) {
                              controller.current = null
                              setRefBusy(null)
                            }
                          }
                        })()
                      }}
                    >
                      {t('ui.OutputAnchorCard.viewLocation')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {rows.length > 50 && (
            <div>
              <button
                type="button"
                disabled={page === 0 || !!refBusy}
                onClick={() => {
                  setRefs(null)
                  setCandidates(null)
                  setCandidateNotice('')
                  setRefNotice('')
                  setPage((value) => value - 1)
                }}
              >
                {t('ui.OutputAnchorCard.previousLocations')}
              </button>
              <button
                type="button"
                disabled={(page + 1) * 50 >= rows.length || !!refBusy}
                onClick={() => {
                  setRefs(null)
                  setCandidates(null)
                  setCandidateNotice('')
                  setRefNotice('')
                  setPage((value) => value + 1)
                }}
              >
                {t('ui.OutputAnchorCard.nextLocations')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
