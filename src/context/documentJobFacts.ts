import { L } from '../i18n/modelText'
import type { TurnRecord } from '../runstate/turnLedger'

import { decompositionTurnReceipts } from './decompositionTurnReceipts'
import { pendingContracts } from './documentJobPendingContracts'
import { documentJobPendingFacts } from './documentJobPendingFacts'
import { formatDocumentJobPreparation } from './documentJobPreparationFacts'
import { documentJobReceipts } from './documentJobReceipts'
import { documentJobReceiptHeader } from './documentJobReceiptText'

export function formatDocumentJobs(
  turns: readonly TurnRecord[],
  currentTurn?: TurnRecord,
): string | null {
  turns = currentTurn ? [...turns, currentTurn] : turns
  const receipts = documentJobReceipts(turns)
  const preparation = currentTurn?.documentJobPreparation
  const decompositions = decompositionTurnReceipts(turns)
  const pending = documentJobPendingFacts(currentTurn)
  return (
    [
      ...pending,
      ...(preparation ? formatDocumentJobPreparation(preparation) : []),
      ...pendingContracts(currentTurn),
      ...(receipts.length ? [documentJobReceiptHeader()] : []),
      ...receipts.map((receipt) => `- ${JSON.stringify(receipt)}`),
      ...decompositions.map((receipt) =>
        L({
          ko: `- 분해 저장: ${JSON.stringify(receipt)}`,
          en: `- Saved decomposition: ${JSON.stringify(receipt)}`,
        }),
      ),
    ].join('\n') || null
  )
}
