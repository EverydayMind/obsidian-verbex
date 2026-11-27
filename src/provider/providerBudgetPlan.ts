import type { ContextBudgets } from '../context/contextBudgets'
import type { RequestTool } from '../types/llm/request'

import type { AllocationAttempt } from './interop/exposureAllocation'
import {
  type NativeExposure,
  selectNativeTools,
} from './interop/exposurePolicy'
import type { NativeToolEntry } from './interop/NativeProviderHost'
import { fitProviderNotes } from './providerNoteBudget'

/**
 * What the input-assembly budgets did to the provider part of one turn. Made
 * once before the turn snapshot; a same-turn re-exposure carries it unchanged.
 */
export type ProviderBudgetDecision = {
  stage: 'none' | 'notes' | 'optional_groups' | 'instructions' | 'stop'
  /** B3/B4: providers whose instruction text is left out. */
  noteOmitted: string[]
  /** B4: tools of the optional groups left out of this turn. */
  demotedTools: string[]
  demoteUnmatched: boolean
  noteTokensBefore: number
  noteTokens: number
  /** Definition tokens (provider, connector, MCP) plus note tokens. */
  overhead: number
  overheadBudget: number
}

type Selection = {
  definitions: RequestTool[]
  tokens: number
  attempts: AllocationAttempt[]
}

const NONE: ProviderBudgetDecision = {
  stage: 'none',
  noteOmitted: [],
  demotedTools: [],
  demoteUnmatched: false,
  noteTokensBefore: 0,
  noteTokens: 0,
  overhead: 0,
  overheadBudget: 0,
}

/** The exposure selection, with or without B4's demotion of unmatched groups. */
export const nativeSelector =
  (entries: readonly NativeToolEntry[], policy: NativeExposure) =>
  (demoteUnmatchedOptional: boolean) =>
    selectNativeTools(entries, { ...policy, demoteUnmatchedOptional })

const nameOf = (tool: RequestTool) => tool.function.name

/** Providers in the order the allocation admitted them: highest rank first. */
function exposureRank(selection: Selection): string[] {
  return [
    ...new Set(
      selection.attempts
        .filter((attempt) => attempt.result === 'added')
        .map((attempt) => attempt.providerId),
    ),
  ]
}

/**
 * B3 and B4 for the provider part of the first request. The note block is kept
 * within its budget (lowest-rank instructions go first). When provider
 * definitions plus notes still take more than their share of the input budget,
 * optional provider groups the request does not match leave the turn, then
 * more instruction text is left out. If that is not enough nothing more is
 * done here: the request preflight stops it as before. With `carried` (a
 * same-turn re-exposure) nothing is decided again.
 */
export async function planProviderBudget<S extends Selection>(input: {
  budgets?: ContextBudgets
  carried?: ProviderBudgetDecision
  /** A same-turn re-exposure: never decide again, even without `carried`. */
  reexposing?: boolean
  select: (demoteUnmatched: boolean) => Promise<S>
  /** The note block for a selection with some providers' instructions omitted. */
  render: (selection: NoInfer<S>, omitted: ReadonlySet<string>) => string
  /** Definition tokens of connector and MCP tools in the same request. */
  otherTokens: number
}): Promise<{ selection: S; decision: ProviderBudgetDecision }> {
  const { budgets, carried } = input
  if (carried)
    return {
      selection: await input.select(carried.demoteUnmatched),
      decision: carried,
    }
  let selection = await input.select(false)
  if (!budgets || input.reexposing) return { selection, decision: NONE }
  const fit = (target: number, start?: string[]) =>
    fitProviderNotes({
      budget: target,
      rank: exposureRank(selection),
      render: (omitted) => input.render(selection, omitted),
      start,
    })
  const overhead = (tokens: number) =>
    selection.tokens + input.otherTokens + tokens
  let notes = await fit(budgets.providerNotes)
  const before = notes.before
  let stage: ProviderBudgetDecision['stage'] = notes.omitted.length
    ? 'notes'
    : 'none'
  let demotedTools: string[] = []
  if (overhead(notes.tokens) > budgets.providerOverhead) {
    const demoted = await input.select(true)
    const kept = new Set(demoted.definitions.map(nameOf))
    demotedTools = selection.definitions
      .map(nameOf)
      .filter((name) => !kept.has(name))
    if (demotedTools.length) {
      selection = demoted
      stage = 'optional_groups'
      notes = await fit(budgets.providerNotes)
    }
    if (overhead(notes.tokens) > budgets.providerOverhead) {
      const room =
        budgets.providerOverhead - selection.tokens - input.otherTokens
      notes = await fit(
        Math.max(0, Math.min(budgets.providerNotes, room)),
        notes.omitted,
      )
      stage =
        overhead(notes.tokens) > budgets.providerOverhead
          ? 'stop'
          : 'instructions'
    }
  }
  return {
    selection,
    decision: {
      stage,
      noteOmitted: notes.omitted,
      demotedTools,
      demoteUnmatched: demotedTools.length > 0,
      noteTokensBefore: before,
      noteTokens: notes.tokens,
      overhead: overhead(notes.tokens),
      overheadBudget: budgets.providerOverhead,
    },
  }
}
