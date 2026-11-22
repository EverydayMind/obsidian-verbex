import { t } from '../i18n'
import type { ProposedChange } from '../verbex/types'
import type { ChangeOutcome, StepExecutor } from '../workflow/StepExecutor'

export class RejectedChangeNotes {
  private readonly counts = new Map<string, number>()
  annotate(change: ProposedChange): ProposedChange {
    const count = this.counts.get(change.path) ?? 0
    return count
      ? {
          ...change,
          approvalNotes: [
            ...(change.approvalNotes ?? []),
            t('ui.VerbexDiffReview.previousRejections', { p0: count }),
          ],
        }
      : change
  }

  annotateChanges(changes: ProposedChange[]): ProposedChange[] {
    return changes.map((change) => this.annotate(change))
  }

  observe(outcome: ChangeOutcome): void {
    if (outcome.rejectedByUser)
      this.counts.set(
        outcome.change.path,
        (this.counts.get(outcome.change.path) ?? 0) + 1,
      )
  }

  batchObserver(record: (outcome: ChangeOutcome, index: number) => void) {
    const indices = new Set<number>()
    return (outcome: ChangeOutcome, index: number) => {
      if (!indices.has(index)) this.observe(outcome)
      indices.add(index)
      record(outcome, index)
    }
  }
}

export type RejectionNotesPort = Pick<
  RejectedChangeNotes,
  'annotate' | 'observe'
>

export async function processLocalChange(
  input: {
    runId: string
    stepExecutor: Pick<StepExecutor, 'processChange'>
    rejectionNotes?: RejectionNotesPort
  },
  change: ProposedChange,
): Promise<ChangeOutcome> {
  const outcome = await input.stepExecutor.processChange(
    input.runId,
    input.rejectionNotes?.annotate(change) ?? change,
  )
  input.rejectionNotes?.observe(outcome)
  return outcome
}
