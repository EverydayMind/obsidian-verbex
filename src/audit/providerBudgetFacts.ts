import type { ProviderBudgetDecision } from '../provider/providerBudgetPlan'
import type { AuditEvent } from '../types/chat'

/**
 * Debug record of what the provider budgets did to one turn (B3/B4). Counts
 * and ids only; never prompts. Nothing is recorded when no budget applied.
 * Distinct from `budgetExposureFacts`, which is text shown to the model.
 */
export function emitProviderBudget(
  enabled: boolean,
  turnId: string,
  decision: ProviderBudgetDecision | undefined,
  notify?: (event: AuditEvent) => void,
): void {
  if (!enabled || !notify || !decision || decision.stage === 'none') return
  notify({
    timestamp: Date.now(),
    actor: 'system',
    kind: 'context_exclusion',
    turnId,
    summary: 'Provider budget applied',
    details: {
      stage: decision.stage,
      omittedInstructions: decision.noteOmitted.join(','),
      demotedTools: decision.demotedTools.join(','),
      noteTokensBefore: decision.noteTokensBefore,
      noteTokens: decision.noteTokens,
      overhead: decision.overhead,
      overheadBudget: decision.overheadBudget,
    },
  })
}
