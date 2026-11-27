import { modelMarker } from '../i18n/modelMarkers'
import { ChangeOutcome } from '../workflow/StepExecutor'

export function summarizeOutcome(outcome: ChangeOutcome): string {
  const path = outcome.change.path
  const notes = outcome.applyNotes?.length
    ? ` — ${outcome.applyNotes.join(' / ')}`
    : ''
  const summary = outcome.change.resultSummary
    ? `\n${outcome.change.resultSummary}`
    : ''
  switch (outcome.status) {
    case 'applied':
      return `${modelMarker('changeApplied')} ${path}${notes}${summary}`
    case 'partially_applied':
      return `${modelMarker('changePartial')} ${path}${notes}${summary}`
    case 'rejected':
      return `${modelMarker('changeRejected')} ${path}${outcome.reason ? ` (${outcome.reason})` : ''}`
    case 'denied':
      return `${modelMarker('changeDenied')} ${path}${outcome.reason ? ` (${outcome.reason})` : ''}`
    case 'conflict':
      return `${modelMarker('changeConflict')} ${path}${outcome.reason ? ` (${outcome.reason})` : ''}`
    case 'checkpoint_failed':
      return `${modelMarker('checkpointFailed')} ${path}`
    case 'apply_failed':
      return `${modelMarker('applyFailed')} ${path}${outcome.error ? ` (${outcome.error})` : ''}`
  }
}
