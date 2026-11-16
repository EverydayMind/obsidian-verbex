import type { TurnRecord } from '../runstate/turnLedger'

export function decompositionTurnReceipts(turns: readonly TurnRecord[]) {
  return turns
    .flatMap((turn) =>
      turn.toolCalls.flatMap((call) =>
        call.decompositionReceipt ? [call.decompositionReceipt] : [],
      ),
    )
    .slice(-5)
}
