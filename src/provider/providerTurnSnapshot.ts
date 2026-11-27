import type { DocumentJobPending } from '../context/documentJobPendingFacts'
import { applyConversationToolSelection } from '../tools/conversationToolPolicy'
import type { RequestTool } from '../types/llm/request'

import { ObservationLedger } from './interop/observationLedger'
import type { ProviderRegistrySnapshot } from './providerTurnTypes'

export const providerTurnIdentifier = (runId: string) =>
  `${runId}:${Date.now()}:${Math.random().toString(36).slice(2)}`

export const providerTurnCaller = (
  input: { runId: string; conversationId?: string; submittedTurnId?: string },
  providerTurnId: string,
) =>
  Object.freeze({
    conversationId: input.conversationId ?? input.runId,
    submittedTurnId: input.submittedTurnId ?? providerTurnId,
  })

export function allowedNativeTools(
  available: RequestTool[],
  selection: { pinned?: string[]; excluded?: string[] },
  required: string[],
  excluded: ReadonlySet<string>,
) {
  return new Set(
    applyConversationToolSelection(available, available, selection, required)
      .filter((tool) => !excluded.has(tool.function.name))
      .map((tool) => tool.function.name),
  )
}

export function providerTurnSnapshot(
  initial: ProviderRegistrySnapshot | undefined,
  input: {
    names: string[]
    caller: NonNullable<ProviderRegistrySnapshot['caller']>
    intended: boolean
    pending: readonly DocumentJobPending[]
    turnScope: ProviderRegistrySnapshot['turnScope']
    browserContext: ProviderRegistrySnapshot['browserContext']
    observations?: ObservationLedger
    /** B4: tools of optional groups left out of this turn for the budget. */
    budgetDemoted?: readonly string[]
  },
): ProviderRegistrySnapshot | undefined {
  if (!initial) return undefined
  return Object.freeze({
    ...initial,
    toolNames: Object.freeze(input.names),
    caller: input.caller,
    documentJobTrigger: input.intended ? 'explicit' : 'structural',
    documentJobExplicitJobIds: Object.freeze(
      input.pending
        .filter((job) => job.trigger === 'explicit')
        .map((job) => job.job_id),
    ),
    turnScope: input.turnScope,
    browserContext: input.browserContext,
    observations: input.observations ?? new ObservationLedger(),
    ...(input.budgetDemoted?.length
      ? { budgetDemoted: Object.freeze([...input.budgetDemoted]) }
      : {}),
  })
}
