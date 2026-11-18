import type { ToolOutcomeRecorder } from '../../runstate/ToolOutcomeRecorder'
import { summarizeOutcome } from '../../utils/changeOutcome'
import type { ChangeOutcome, StepExecutor } from '../../workflow/StepExecutor'
import {
  type AgentToolOutcome,
  toolOutcomeFromChange,
} from '../llm/toolOutcome'

import { appendChangeText } from './frontmatterRemovalFact'
import {
  type LocalChangeFactProvider,
  appendLocalChangeFacts,
} from './localChangeFacts'
import {
  type LocalChangePreparer,
  prepareLocalChange,
} from './localChangePreparation'
import type { ToolResult } from './localToolCommon'
import { observePreparedChange } from './observePreparedChange'

export type { LocalChangeFactProvider } from './localChangeFacts'

/** Local mutation tail shared by agent dispatch. The StepExecutor remains the
 * sole owner of permission, approval, checkpoint and apply. */
export async function applyLocalChange(input: {
  runId: string
  result: Extract<ToolResult, { kind: 'change' }>
  stepExecutor: Pick<StepExecutor, 'processChange'>
  outcomes: Pick<ToolOutcomeRecorder, 'recordToolOutcome'>
  openAppliedNotes: boolean
  verificationWarning?: string
  conversationId?: string
  signal?: AbortSignal
  prepare?: LocalChangePreparer
  facts?: LocalChangeFactProvider
  finalize?: (
    outcome: ChangeOutcome,
    base: AgentToolOutcome,
    runId: string,
  ) => Promise<AgentToolOutcome>
}): Promise<AgentToolOutcome> {
  const prepared = await prepareLocalChange(input.prepare, {
    change: input.result.change,
    conversationId: input.conversationId,
    signal: input.signal,
  })
  input.signal?.throwIfAborted()
  const outcome = await input.stepExecutor.processChange(
    input.runId,
    prepared?.change ?? input.result.change,
  )
  await input.outcomes.recordToolOutcome(input.runId, outcome, {
    openAppliedNotes: input.openAppliedNotes,
  })
  const base = toolOutcomeFromChange(outcome, summarizeOutcome(outcome))
  if (input.verificationWarning)
    base.displayText = `${input.verificationWarning}\n${base.displayText}`
  let finalized = input.finalize
    ? await input.finalize(outcome, base, input.runId)
    : base
  const observation = await observePreparedChange(
    prepared?.afterApply,
    outcome.status,
  )
  finalized = appendChangeText(
    finalized,
    outcome,
    typeof observation === 'string' ? observation : observation?.text,
  )
  return appendLocalChangeFacts(finalized, input.facts, {
    observation:
      typeof observation === 'object' ? observation.observation : undefined,
    status: outcome.status,
    changedPath: finalized.changedPath,
    conversationId: input.conversationId,
    signal: input.signal,
  })
}
