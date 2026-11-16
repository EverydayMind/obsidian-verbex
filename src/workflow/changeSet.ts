import { DiffBlock, createDiffBlocks } from '../utils/chat/diff'
import { ApprovalStatus, ChangeApproval, ProposedChange } from '../verbex/types'

export function rejectedApproval(
  change: ProposedChange,
  reason: string,
): ChangeApproval {
  return {
    changeId: change.id,
    status: 'rejected',
    approvedHunks: [],
    rejectedHunks: [],
    reason,
  }
}

export function duplicateChangeIds(
  changes: readonly ProposedChange[],
): Set<string> {
  const seen = new Set<string>(),
    duplicates = new Set<string>()
  for (const change of changes) {
    if (seen.has(change.id)) duplicates.add(change.id)
    seen.add(change.id)
  }
  return duplicates
}

/**
 * Hunk-level diff model behind the Diff view (PRD §11). A proposed change is
 * split into line blocks; the view lets the user approve or reject each
 * modified block ("hunk") independently. Reconstructing the file from the
 * per-hunk decisions is pure and unit-tested here so the apply path is
 * verifiable without the React layer.
 */

export type DiffHunk = {
  /** Index into the block list, used as the hunk's stable handle. */
  blockIndex: number
  originalValue?: string
  modifiedValue?: string
}

/** Line blocks for a change's body (before vs after). */
export function computeChangeBlocks(change: ProposedChange): DiffBlock[] {
  return createDiffBlocks(change.before ?? '', change.after ?? '')
}

/** The modified blocks (hunks) the user can accept/reject. */
export function toHunks(blocks: DiffBlock[]): DiffHunk[] {
  const hunks: DiffHunk[] = []
  blocks.forEach((block, blockIndex) => {
    if (block.type === 'modified') {
      hunks.push({
        blockIndex,
        originalValue: block.originalValue,
        modifiedValue: block.modifiedValue,
      })
    }
  })
  return hunks
}

/**
 * Reconstruct the file content that should be written given the set of
 * rejected hunks. Approved hunks contribute their incoming value; rejected
 * hunks keep the current (original) value; unchanged blocks pass through.
 */
export function resolveApprovedContent(
  blocks: DiffBlock[],
  rejectedBlockIndices: Iterable<number>,
): string {
  const rejected = new Set(rejectedBlockIndices)
  const parts: string[] = []
  blocks.forEach((block, index) => {
    if (block.type === 'unchanged') {
      parts.push(block.value)
      return
    }
    const chosen = rejected.has(index)
      ? block.originalValue
      : block.modifiedValue
    if (chosen !== undefined) parts.push(chosen)
  })
  return parts.join('\n')
}

export function approvalStatus(
  hunks: DiffHunk[],
  rejectedBlockIndices: Iterable<number>,
): ApprovalStatus {
  const rejected = new Set(rejectedBlockIndices)
  const rejectedHunks = hunks.filter((hunk) => rejected.has(hunk.blockIndex))
  if (rejectedHunks.length === 0) return 'approved'
  if (rejectedHunks.length === hunks.length) return 'rejected'
  return 'partial_approved'
}

/**
 * Build the approval record for a reviewed change. `rejectedBlockIndices` are
 * the block indices the user rejected; everything else is approved. A change
 * with no hunks (e.g. a pure rename/move) is treated as wholly approved.
 */
export function buildApproval(
  change: ProposedChange,
  blocks: DiffBlock[],
  rejectedBlockIndices: Iterable<number> = [],
  reason?: string,
): ChangeApproval {
  const hunks = toHunks(blocks)
  const rejected = new Set(rejectedBlockIndices)
  const approvedHunks = hunks
    .filter((hunk) => !rejected.has(hunk.blockIndex))
    .map((hunk) => hunk.blockIndex)
  const rejectedHunks = hunks
    .filter((hunk) => rejected.has(hunk.blockIndex))
    .map((hunk) => hunk.blockIndex)
  return {
    changeId: change.id,
    status: hunks.length === 0 ? 'approved' : approvalStatus(hunks, rejected),
    approvedHunks,
    rejectedHunks,
    reason,
  }
}
