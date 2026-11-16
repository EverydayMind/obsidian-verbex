import type { CheckpointManager } from '../checkpoint/CheckpointManager'
import { issueApplyPermit } from '../security/promptInjectionBoundary'
import { sha256Hex } from '../utils/hash'
import type { ProposedChange } from '../verbex/types'

import type { ChangeApplier } from './changeApplier'

export async function applyAndRecord(
  applier: ChangeApplier,
  manager: CheckpointManager,
  input: {
    runId: string
    checkpointId?: string
    change: ProposedChange
    content: string | null
  },
): Promise<void> {
  const { runId, change, content } = input
  const execution = await issueApplyPermit({ ...change, after: content }, runId)
  await applier.apply(change, content, execution, {
    runId,
    turnId: `apply-${change.id}`,
  })
  await recordAppliedChange(manager, input)
}

export async function recordAppliedChange(
  manager: CheckpointManager,
  input: {
    runId: string
    checkpointId?: string
    change: ProposedChange
    content: string | null
  },
): Promise<void> {
  const { runId, checkpointId, change, content } = input
  if (!checkpointId) return
  try {
    await manager.recordApplied(
      runId,
      checkpointId,
      change.path,
      content === null ? null : await sha256Hex(content),
    )
  } catch {
    // The apply already succeeded; do not claim that it failed.
  }
}
