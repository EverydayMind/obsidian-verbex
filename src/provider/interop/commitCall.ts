import type { CommitRuntime } from './commitPrepare'
import type { CommitPreparation } from './commitProtocol'
import type { NativeCall } from './readExecution'

export type CommitCall = NativeCall & {
  providerName: string
  runtime?: CommitRuntime
  resolveTimeoutMs?: number
  /** Host-internal only; never derived from model tool arguments. */
  hostOutputAnchorLeaseId?: string
  /** Host-only observation after approval and before checkpoint/write. */
  onPrepared?: (
    preparation: Pick<
      CommitPreparation,
      'preparationId' | 'report' | 'destination' | 'mode' | 'writeSet'
    >,
  ) => void
  /** Host-only final guard after approval and before the durable checkpoint. */
  beforeCheckpoint?: (preparation: CommitPreparation) => Promise<void>
}
