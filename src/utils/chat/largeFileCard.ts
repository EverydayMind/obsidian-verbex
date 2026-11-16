import { t } from '../../i18n'
import { hasModelMarker } from '../../i18n/modelMarkers'
import { LargeFileCardState, LargeFileCardStep } from '../../types/chat'
import { ToolCallResponseStatus } from '../../types/tool-call.types'

export function classifyVerbexToolResult(
  result: string,
):
  | ToolCallResponseStatus.Success
  | ToolCallResponseStatus.Rejected
  | ToolCallResponseStatus.Error {
  if (
    hasModelMarker(result, 'changeRejected') ||
    hasModelMarker(result, 'changeDenied') ||
    hasModelMarker(result, 'toolCancelled')
  ) {
    return ToolCallResponseStatus.Rejected
  }
  if (
    hasModelMarker(result, 'toolError') ||
    hasModelMarker(result, 'checkpointFailed') ||
    hasModelMarker(result, 'applyFailed') ||
    hasModelMarker(result, 'validationFailed')
  ) {
    return ToolCallResponseStatus.Error
  }
  return ToolCallResponseStatus.Success
}

// §6.3: work-focused labels for the large-file status card. Internal tool and
// phase names (map/reduce/token counts) are intentionally not surfaced.
const LARGE_FILE_PHASE_LABELS: Record<string, string> = {
  mapping: t('ui.largeFileCard.analyzeBySection'),
  reducing: t('ui.largeFileCard.synthesize'),
  verifying: t('ui.largeFileCard.crossCheck'),
  transforming: t('ui.largeFileCard.convertBySection'),
}

export function largeFilePhaseOrder(
  operation: 'analysis' | 'transform',
): string[] {
  return operation === 'transform'
    ? ['transforming']
    : ['mapping', 'reducing', 'verifying']
}

export type LargeFileProgressEvent = {
  operation: 'analysis' | 'transform'
  phase: string
  path: string
  index: number
  total: number
}

/**
 * Fold one progress event into the card: phases before the current one are done
 * (keeping their last detail), the current one is active with its N/total, and
 * later phases are omitted until they actually begin (a non-sequential analysis
 * never reaches the verify step, so it must not show a stuck pending row).
 */
export function updateLargeFileCard(
  prev: LargeFileCardState | null,
  event: LargeFileProgressEvent,
): LargeFileCardState {
  const order = largeFilePhaseOrder(event.operation)
  const currentIndex = order.indexOf(event.phase)
  const steps: LargeFileCardStep[] = []
  for (let i = 0; i <= currentIndex; i++) {
    const key = order[i]
    if (i < currentIndex) {
      const prevStep = prev?.steps.find((step) => step.key === key)
      steps.push({
        key,
        label: LARGE_FILE_PHASE_LABELS[key] ?? key,
        status: 'done',
        detail: prevStep?.detail,
      })
    } else {
      steps.push({
        key,
        label: LARGE_FILE_PHASE_LABELS[key] ?? key,
        status: 'active',
        detail: `${event.index}/${event.total}`,
      })
    }
  }
  return {
    operation: event.operation,
    path: event.path,
    title:
      event.operation === 'transform'
        ? t('ui.largeFileCard.largeDocumentConversion')
        : t('ui.largeFileCard.wholeDocumentAnalysis'),
    steps,
    done: false,
    outcome: 'running',
  }
}

export function finalizeLargeFileCard(
  card: LargeFileCardState,
  outcome: 'completed' | 'failed' | 'cancelled' = 'completed',
): LargeFileCardState {
  return {
    ...card,
    done: true,
    outcome,
    steps: card.steps.map((step) => ({
      ...step,
      status:
        outcome === 'completed'
          ? 'done'
          : step.status === 'active'
            ? outcome
            : step.status,
    })),
  }
}
