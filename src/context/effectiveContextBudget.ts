import type { VerbexSettings } from '../settings/schema/setting.types'

/** Resolves the context-selection budget from the explicit persisted mode. */
export function effectiveContextBudget(
  settings: VerbexSettings,
  physicalInputBudget: number,
): number {
  const context = settings.verbex.context
  return context.contextBudgetMode === 'auto'
    ? physicalInputBudget
    : Math.min(context.maxContextTokens, physicalInputBudget)
}
