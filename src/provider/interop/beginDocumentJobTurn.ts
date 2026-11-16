import { notifyDocumentJobBlocked } from './documentJobNotice'
import type { NativeProviderHost } from './NativeProviderHost'
import { prepareDocumentJobTurn } from './prepareDocumentJobTurn'
import { recordDocumentJobTurn } from './recordDocumentJobTurn'

/** Records the pre-model result as turn-owned facts. */
export async function beginDocumentJobTurn(
  host: NativeProviderHost | undefined,
  input: Omit<
    Parameters<typeof prepareDocumentJobTurn>[1],
    'conversationId'
  > & {
    runId: string
    submittedTurnId?: string
    conversationId?: string
    turnRecord?: import('../../runstate/turnLedger').TurnRecord
    onStatusChange?: import('../../core/llm/agentLoop').AgentLoopDeps['onStatusChange']
  },
) {
  const { runId, submittedTurnId } = input
  const result = await prepareDocumentJobTurn(host, {
    ...input,
    conversationId: input.conversationId ?? input.runId,
    onStart: () =>
      input.onStatusChange?.({
        type: 'tool_start',
        toolName: 'prepare_format_reuse',
        args: '{}',
        iteration: 0,
      }),
  })
  recordDocumentJobTurn(input.turnRecord, result)
  if (host && 'result' in result && result.result)
    notifyDocumentJobBlocked(host, runId, result.result, submittedTurnId)
  return result
}
