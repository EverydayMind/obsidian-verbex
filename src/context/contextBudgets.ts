import type { VerbexSettings } from '../settings/schema/setting.types'

/**
 * Input-assembly budgets (P0c-5). They protect against growth: each one is a
 * share of the request's input budget `I` for the model it is sent to
 * (modelContextBudgets.ts), cut to a floor and to a user ceiling. The shares
 * are chosen so that the shipped state (sample vault, default settings and an
 * unknown model: I = 24,000) never reaches them.
 * The provider tool-definition limit is a separate fixed 8,000 (DECISIONS D14)
 * and is not derived from these.
 */
export const BUDGET_SHARES = {
  selector: 0.25,
  skillTotal: 0.6,
  providerNotes: 0.25,
  /** Definitions plus provider notes may take this share before B4 demotes. */
  providerOverhead: 0.65,
} as const

export const BUDGET_FLOORS = {
  selector: 1500,
  skillTotal: 4000,
  providerNotes: 1500,
} as const

export type ContextBudgets = {
  input: number
  selector: number
  skillTotal: number
  providerNotes: number
  providerOverhead: number
}

type ContextSettings = Pick<
  VerbexSettings['verbex']['context'],
  'selectorTokenBudget' | 'skillTotalTokenBudget' | 'providerNoteTokenBudget'
>

const clamp = (share: number, floor: number, ceiling: number, input: number) =>
  Math.floor(Math.min(input, ceiling, Math.max(floor, share * input)))

/** Resolves every input-assembly budget from the ceilings and the input budget. */
export function contextBudgets(
  context: ContextSettings,
  inputBudget: number,
): ContextBudgets {
  const input = Math.max(1000, inputBudget)
  return {
    input,
    selector: clamp(
      BUDGET_SHARES.selector,
      BUDGET_FLOORS.selector,
      context.selectorTokenBudget,
      input,
    ),
    skillTotal: clamp(
      BUDGET_SHARES.skillTotal,
      BUDGET_FLOORS.skillTotal,
      context.skillTotalTokenBudget,
      input,
    ),
    providerNotes: clamp(
      BUDGET_SHARES.providerNotes,
      BUDGET_FLOORS.providerNotes,
      context.providerNoteTokenBudget,
      input,
    ),
    providerOverhead: Math.floor(BUDGET_SHARES.providerOverhead * input),
  }
}
