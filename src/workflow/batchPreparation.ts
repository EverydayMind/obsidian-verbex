import {
  type PermissionDecision,
  type PermissionManager,
  escalateLostLines,
} from '../permissions/PermissionManager'
import { runtimeTimers } from '../platform/runtime'
import type { DiffBlock } from '../utils/chat/diff'
import type { ProposedChange } from '../verbex/types'

import { computeChangeBlocks } from './changeSet'

export type BatchEntry = {
  change: ProposedChange
  decision: PermissionDecision
  blocks: DiffBlock[]
}

/** Pin permission decisions before yielding; keep long diff preparation responsive. */
export function prepareBatchEntries(
  changes: ProposedChange[],
  permissions: PermissionManager,
): BatchEntry[] | Promise<BatchEntry[]> {
  const entries: BatchEntry[] = changes.map((change) => ({
    change,
    decision: permissions.decideForChange(change, []),
    blocks: [],
  }))
  function prepareFrom(start: number): BatchEntry[] | Promise<BatchEntry[]> {
    const sliceStart = performance.now()
    for (let i = start; i < entries.length; i++) {
      const entry = entries[i]
      if (entry.decision.action !== 'deny') {
        entry.blocks = computeChangeBlocks(entry.change)
        entry.decision = escalateLostLines(
          entry.change,
          entry.decision,
          entry.blocks,
        )
      }
      if (
        entries.length >= 8 &&
        i + 1 < entries.length &&
        performance.now() - sliceStart >= 8
      ) {
        return new Promise<void>((resolve) =>
          runtimeTimers.setTimeout(resolve, 0),
        ).then(() => prepareFrom(i + 1))
      }
    }
    return entries
  }
  return prepareFrom(0)
}
