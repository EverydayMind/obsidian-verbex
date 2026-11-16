import { useState } from 'react'

import { PermissionDecision } from '../../permissions/PermissionManager'
import { DiffBlock } from '../../utils/chat/diff'
import { ChangeApproval, ProposedChange } from '../../verbex/types'
import { buildApproval } from '../../workflow/changeSet'

import { ChangeApprovalNotes } from './ChangeApprovalNotes'

/**
 * Multi-file Diff review. Renders every proposed change of a batch with
 * per-file collapsible sections and per-hunk apply checkboxes. Resolves one
 * ChangeApproval per change, in request order.
 */

export type BatchRequest = {
  change: ProposedChange
  decision: PermissionDecision
  blocks: DiffBlock[]
}

const KIND_LABEL: Record<ProposedChange['kind'], string> = {
  create: 'Create',
  body: 'Body',
  frontmatter: 'Frontmatter',
  rename: 'Rename',
  move: 'Move',
  delete: 'Delete',
  link: 'Link',
}

type FileState = {
  excluded: boolean
  rejectedHunks: Set<number>
}

export function VerbexBatchDiffReview({
  requests,
  onResolve,
}: {
  requests: BatchRequest[]
  onResolve: (approvals: ChangeApproval[]) => void
}) {
  const [state, setState] = useState<FileState[]>(() =>
    requests.map(() => ({ excluded: false, rejectedHunks: new Set<number>() })),
  )

  const update = (index: number, next: Partial<FileState>) =>
    setState((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...next } : item)),
    )

  const toggleHunk = (fileIndex: number, blockIndex: number) =>
    setState((prev) =>
      prev.map((item, i) => {
        if (i !== fileIndex) return item
        const rejectedHunks = new Set(item.rejectedHunks)
        if (rejectedHunks.has(blockIndex)) rejectedHunks.delete(blockIndex)
        else rejectedHunks.add(blockIndex)
        return { ...item, rejectedHunks }
      }),
    )

  const buildApprovals = (rejectAll: boolean): ChangeApproval[] =>
    requests.map((req, index) => {
      const fileState = state[index]
      if (rejectAll || fileState.excluded) {
        return {
          changeId: req.change.id,
          status: 'rejected' as const,
          approvedHunks: [],
          rejectedHunks: [],
          reason: rejectAll
            ? 'User rejected all changes.'
            : 'User excluded this file.',
        }
      }
      return buildApproval(
        req.change,
        req.blocks,
        [...fileState.rejectedHunks],
        req.decision.reason,
      )
    })

  const includedCount = state.filter((item) => !item.excluded).length

  return (
    <div className="verbex-batch-diff">
      <div className="verbex-batch-summary">
        {includedCount} of {requests.length} changes selected
      </div>

      <div className="verbex-diff-actions verbex-batch-actions">
        <button
          className="mod-cta"
          onClick={() => onResolve(buildApprovals(false))}
        >
          Apply selected
        </button>
        <button onClick={() => onResolve(buildApprovals(true))}>
          Reject all
        </button>
      </div>

      {requests.map((req, index) => {
        const fileState = state[index]
        return (
          <details
            key={req.change.id}
            className="verbex-batch-file"
            open={!fileState.excluded}
          >
            <summary>
              <span className="verbex-diff-kind">
                {KIND_LABEL[req.change.kind]}
              </span>
              <span className="verbex-diff-path">
                {req.change.originalPath &&
                req.change.originalPath !== req.change.path
                  ? `${req.change.originalPath} -> ${req.change.path}`
                  : req.change.path}
              </span>
              {req.change.dangerous && (
                <span className="verbex-diff-danger">High risk</span>
              )}
            </summary>

            <ChangeApprovalNotes change={req.change} />

            <label className="verbex-batch-exclude">
              <input
                type="checkbox"
                checked={fileState.excluded}
                onChange={() =>
                  update(index, { excluded: !fileState.excluded })
                }
              />
              Exclude this file
            </label>

            {!fileState.excluded && (
              <div className="verbex-diff-blocks">
                {req.blocks.map((block, blockIndex) =>
                  block.type === 'unchanged' ? (
                    <pre key={blockIndex} className="verbex-diff-context">
                      {block.value}
                    </pre>
                  ) : (
                    <div key={blockIndex} className="verbex-diff-hunk">
                      <label className="verbex-diff-hunk-toggle">
                        <input
                          type="checkbox"
                          disabled={req.change.approvalMode === 'whole_change'}
                          checked={!fileState.rejectedHunks.has(blockIndex)}
                          onChange={() => toggleHunk(index, blockIndex)}
                        />
                        {req.change.approvalMode === 'whole_change'
                          ? 'Whole change'
                          : 'Apply'}
                      </label>
                      {block.originalValue !== undefined && (
                        <pre className="verbex-diff-removed">
                          {block.originalValue}
                        </pre>
                      )}
                      {block.modifiedValue !== undefined && (
                        <pre className="verbex-diff-added">
                          {block.modifiedValue}
                        </pre>
                      )}
                    </div>
                  ),
                )}
              </div>
            )}
          </details>
        )
      })}
    </div>
  )
}
