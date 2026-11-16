/**
 * The NEXT button after a turn that executed no tool call.
 *
 * Two countable facts decide this, not the wording of the answer: the user
 * pressed NEXT (`isContinuationSignal`), and the previous turn's ledger holds
 * zero tool calls. A small model that only announces what it will do repeats
 * the announcement on a plain continuation; a required tool call breaks the
 * loop (f-take20~22: five to seven announce-only turns in a row, while every
 * required retry produced a call).
 */
export function continuationRequiresToolCall(input: {
  isContinuationSignal?: boolean
  toolsEnabled: boolean
  previousTurn?: { toolCalls?: readonly unknown[] } | null
}): boolean {
  return (
    input.isContinuationSignal === true &&
    input.toolsEnabled &&
    !!input.previousTurn &&
    (input.previousTurn.toolCalls?.length ?? 0) === 0
  )
}
