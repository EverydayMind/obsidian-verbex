import type { RequestTool } from '../../types/llm/request'
import type { ProviderBudgetDecision } from '../providerBudgetPlan'
import type { ProviderRegistrySnapshot } from '../providerTurnTypes'
import { toolDefinitionTokenCount } from '../toolDefinitionTokenCount'

import { MAX_NATIVE_DEFINITION_TOKENS } from './exposurePolicy'
import type { NativeToolEntry } from './NativeProviderHost'
import type { ObservationLedger } from './observationLedger'

export type Reexposure = {
  names: readonly string[]
  observations: ObservationLedger
  providerTurnId: string
  snapshot?: ProviderRegistrySnapshot
  /** The first request's budget decision; a re-exposure never decides again. */
  budget?: ProviderBudgetDecision
}

export async function addReexposure(
  entries: readonly NativeToolEntry[],
  reexpose: Reexposure | undefined,
  excluded: readonly string[],
  jobExcluded: ReadonlySet<string>,
  selection: { definitions: RequestTool[]; tokens: number },
) {
  const addition = await reexposeNative(
    entries,
    reexpose?.names ?? [],
    new Set([...excluded, ...jobExcluded]),
    selection.definitions,
    selection.tokens,
  )
  selection.definitions.push(...addition.definitions)
  selection.tokens += addition.tokens
  return addition
}

export async function reexposeNative(
  entries: readonly NativeToolEntry[],
  names: readonly string[],
  excluded: ReadonlySet<string>,
  definitions: readonly RequestTool[],
  tokens: number,
) {
  const eligible = entries.filter((entry) => !excluded.has(entry.name))
  const requested = eligible.filter((entry) => names.includes(entry.name))
  const providers = new Set(requested.map((entry) => entry.providerId))
  const selected = new Set(definitions.map((item) => item.function.name))
  const fresh = eligible.filter(
    (entry) =>
      !selected.has(entry.name) &&
      (names.includes(entry.name) ||
        (providers.has(entry.providerId) &&
          (entry.tool.group ?? 'core') === 'core')),
  )
  let cost = 0
  for (const entry of fresh)
    cost += await toolDefinitionTokenCount(entry.definition)
  if (tokens + cost > MAX_NATIVE_DEFINITION_TOKENS)
    return { definitions: [], names: [], tokens: 0, budgetExceeded: true }
  return {
    definitions: fresh.map((entry) => entry.definition),
    names: fresh.map((entry) => entry.name),
    tokens: cost,
    budgetExceeded: false,
  }
}
