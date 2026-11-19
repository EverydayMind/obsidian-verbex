import { useEffect, useMemo, useState } from 'react'

import { t } from '../../i18n'
import { PermissionDecision } from '../../permissions/PermissionManager'
import { DiffBlock } from '../../utils/chat/diff'
import { ChangeApproval, ProposedChange } from '../../verbex/types'
import { buildApproval, resolveApprovedContent } from '../../workflow/changeSet'

import { ChangeApprovalNotes } from './ChangeApprovalNotes'
import { shownPermissionReason } from './permissionReasonText'

/**
 * Hunk-level review for a single proposed change. Each modified block gets an
 * apply checkbox; unchecking it rejects that hunk so only approved hunks are
 * written. Dangerous changes are never eligible for Auto Mode countdown.
 */

const KIND_LABEL: Record<ProposedChange['kind'], string> = {
  create: 'ui.VerbexDiffReview.create',
  body: 'ui.VerbexDiffReview.body',
  frontmatter: 'ui.VerbexDiffReview.frontmatter',
  rename: 'ui.VerbexDiffReview.rename',
  move: 'ui.VerbexDiffReview.move',
  delete: 'ui.VerbexDiffReview.delete',
  link: 'ui.VerbexDiffReview.link',
}

export function VerbexDiffReview({
  change,
  decision,
  blocks,
  autoModeTimeoutSeconds,
  onResolve,
}: {
  change: ProposedChange
  decision: PermissionDecision
  blocks: DiffBlock[]
  /** When set and the change is non-dangerous, a countdown auto-approves. */
  autoModeTimeoutSeconds: number | null
  onResolve: (approval: ChangeApproval) => void
}) {
  const modifiedIndices = useMemo(
    () =>
      blocks.reduce<number[]>((acc, block, index) => {
        if (block.type !== 'unchanged') acc.push(index)
        return acc
      }, []),
    [blocks],
  )
  const [rejected, setRejected] = useState<Set<number>>(new Set())

  const canAutoApply = autoModeTimeoutSeconds !== null && !change.dangerous
  const [remaining, setRemaining] = useState<number | null>(
    canAutoApply ? autoModeTimeoutSeconds : null,
  )

  const accept = (rejectedIndices: Iterable<number>) =>
    onResolve(
      buildApproval(change, blocks, [...rejectedIndices], decision.reason),
    )

  const rejectAll = () =>
    onResolve({
      changeId: change.id,
      status: 'rejected',
      approvedHunks: [],
      rejectedHunks: modifiedIndices,
      reason: 'User rejected the change.',
    })

  useEffect(() => {
    if (remaining === null) return
    if (remaining <= 0) {
      accept(rejected)
      return
    }
    const id = window.setTimeout(
      () => setRemaining((value) => (value ?? 0) - 1),
      1000,
    )
    return () => window.clearTimeout(id)
  }, [remaining])

  const cancelCountdown = () => setRemaining(null)

  const toggle = (index: number) => {
    cancelCountdown()
    setRejected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const preview = resolveApprovedContent(blocks, rejected)

  return (
    <div className="verbex-diff-review">
      <div className="verbex-diff-header">
        <span className="verbex-diff-kind">{t(KIND_LABEL[change.kind])}</span>
        <span className="verbex-diff-path">
          {change.originalPath && change.originalPath !== change.path
            ? `${change.originalPath} -> ${change.path}`
            : change.path}
        </span>
        {change.dangerous && (
          <span className="verbex-diff-danger">
            {t('ui.VerbexDiffReview.highRisk')}
          </span>
        )}
      </div>
      <div className="verbex-diff-reason">
        {shownPermissionReason(
          decision.reason,
          canAutoApply && remaining === null,
        )}
      </div>
      <ChangeApprovalNotes change={change} />

      {remaining !== null && (
        <div className="verbex-diff-countdown">
          {t('ui.VerbexDiffReview.countdown', { p0: remaining })}
          <button onClick={cancelCountdown}>
            {t('ui.VerbexDiffReview.reviewManually')}
          </button>
        </div>
      )}

      <div className="verbex-diff-blocks">
        {blocks.map((block, index) =>
          block.type === 'unchanged' ? (
            <pre key={index} className="verbex-diff-context">
              {block.value}
            </pre>
          ) : (
            <div key={index} className="verbex-diff-hunk">
              <label className="verbex-diff-hunk-toggle">
                <input
                  type="checkbox"
                  disabled={change.approvalMode === 'whole_change'}
                  checked={!rejected.has(index)}
                  onChange={() => toggle(index)}
                />
                {change.approvalMode === 'whole_change'
                  ? t('ui.VerbexDiffReview.wholeChange')
                  : t('ui.VerbexDiffReview.includeChange')}
              </label>
              {block.originalValue !== undefined && (
                <pre className="verbex-diff-removed">{block.originalValue}</pre>
              )}
              {block.modifiedValue !== undefined && (
                <pre className="verbex-diff-added">{block.modifiedValue}</pre>
              )}
            </div>
          ),
        )}
      </div>

      {change.op !== 'delete' && (
        <details className="verbex-diff-preview">
          <summary>{t('ui.VerbexDiffReview.preview')}</summary>
          <pre>{preview}</pre>
        </details>
      )}

      <div className="verbex-diff-actions">
        <button className="mod-cta" onClick={() => accept(rejected)}>
          {rejected.size > 0 && rejected.size < modifiedIndices.length
            ? t('ui.VerbexDiffReview.applySelected')
            : t('ui.ToolMessage.apply')}
        </button>
        <button onClick={rejectAll}>{t('ui.ToolMessage.reject')}</button>
      </div>
    </div>
  )
}
