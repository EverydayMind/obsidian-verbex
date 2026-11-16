import type { ProposedChange } from '../../verbex/types'
import type { ChangeOutcome } from '../../workflow/StepExecutor'

import { TIDY_TOOL_NAMES } from './tidyTools'

const MAX_ENTRIES = 500
const TIDY = new Set<string>(TIDY_TOOL_NAMES)

function hash(text: string): string {
  let value = 5381
  for (let i = 0; i < text.length; i += 1)
    value = ((value << 5) + value + text.charCodeAt(i)) | 0
  return (value >>> 0).toString(36)
}

/** The same proposal over the same note contents gets the same key. */
export function proposalKey(change: ProposedChange): string {
  return hash(
    JSON.stringify([
      change.tool,
      change.originalPath ?? null,
      change.path,
      change.before,
      change.after,
      (change.composite?.entries ?? []).map((entry) => [
        entry.op,
        entry.path,
        entry.before,
      ]),
    ]),
  )
}

/**
 * Memory-only record of tidy proposals the user rejected, per conversation run.
 * Filled from structured outcomes only; a plugin restart forgets it.
 */
export class TidyLedger {
  private readonly rejected = new Map<string, string>()

  record(runId: string, outcome: ChangeOutcome): void {
    if (outcome.status !== 'rejected' || !TIDY.has(outcome.change.tool)) return
    if (this.rejected.size >= MAX_ENTRIES) {
      const [oldest] = this.rejected.keys()
      this.rejected.delete(oldest)
    }
    this.rejected.set(
      `${runId}\u0000${proposalKey(outcome.change)}`,
      outcome.reason ?? outcome.approval?.reason ?? '',
    )
  }

  /** The rejection reason when this exact proposal was rejected in the run. */
  rejectedReason(runId: string, change: ProposedChange): string | null {
    return this.rejected.get(`${runId}\u0000${proposalKey(change)}`) ?? null
  }
}
