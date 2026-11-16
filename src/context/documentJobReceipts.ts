import type { TurnRecord } from '../runstate/turnLedger'

export function documentJobReceipts(turns: readonly TurnRecord[]) {
  const latest = new Map<
    string,
    NonNullable<TurnRecord['toolCalls'][number]['documentJobReceipt']>
  >()
  for (const turn of turns)
    for (const call of turn.toolCalls) {
      const receipt = call.documentJobReceipt
      if (!receipt) continue
      latest.delete(receipt.outputPath)
      latest.set(receipt.outputPath, receipt)
    }
  return [...latest.values()].reverse().slice(0, 5)
}
