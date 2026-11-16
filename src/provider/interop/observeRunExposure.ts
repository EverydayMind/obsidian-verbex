import { observeChatCalls } from '../../core/llm/callObservation'
import { sha256Hex } from '../../utils/hash'

import type { InteropDiagnostics } from './diagnostics'
import type { ExposureWireFact } from './exposureDiagnosticBuffer'

/** Store the first actual wire list per logical call without recording retry timing. */
export function observeRunExposure(
  signal: AbortSignal,
  diagnostics: Pick<InteropDiagnostics, 'recordWireExposure'>,
  runId: string,
): () => void {
  const seen = new Set<number>()
  const record = (fact: ExposureWireFact) => {
    try {
      diagnostics.recordWireExposure(fact)
    } catch {
      /* observational only */
    }
  }
  return observeChatCalls(signal, (event) => {
    if (event.phase !== 'wire' || seen.has(event.sequence)) return
    seen.add(event.sequence)
    const names = event.names ? [...event.names] : undefined
    if (!names) {
      record({ runId, sequence: event.sequence })
      return
    }
    // Do not hold the provider call while computing diagnostic metadata.
    void sha256Hex(JSON.stringify(names)).then(
      (listHash) =>
        record({ runId, sequence: event.sequence, names, listHash }),
      () =>
        record({
          runId,
          sequence: event.sequence,
          names,
          hashUnavailable: true,
        }),
    )
  })
}
