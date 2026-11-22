import { processLocalChange } from '../../context/rejectedChangeNotes'
import { summarizeOutcome } from '../../utils/changeOutcome'
import { toolOutcomeFromChange } from '../llm/toolOutcome'

import type { ApplyLocalChangeInput } from './applyLocalChangeInput'
import { appendChangeText } from './frontmatterRemovalFact'
import { appendLocalChangeFacts } from './localChangeFacts'
import { prepareLocalChange } from './localChangePreparation'
import { observePreparedChange } from './observePreparedChange'

export type { LocalChangeFactProvider } from './localChangeFacts'

/** Local mutation tail shared by agent dispatch. The StepExecutor remains the
 * sole owner of permission, approval, checkpoint and apply. */
export async function applyLocalChange(input: ApplyLocalChangeInput) {
  const prepared = await prepareLocalChange(input.prepare, {
    change: input.result.change,
    conversationId: input.conversationId,
    signal: input.signal,
  })
  input.signal?.throwIfAborted()
  const outcome = await processLocalChange(
    input,
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
