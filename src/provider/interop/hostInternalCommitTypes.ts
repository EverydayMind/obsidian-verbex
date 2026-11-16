import type { AgentToolOutcome } from '../../core/llm/toolOutcome'
import type { TurnCommitFact } from '../../runstate/commitTurnFacts'
import type { ProviderExecutionContext } from '../ProviderRegistry'

import type { CommitPreparation } from './commitProtocol'
import type { SavedOutputAnchorPage } from './outputAnchorRead'
import type { SavedAnchorReference } from './resolveSavedAnchorRefs'

export type InternalCommitInput = {
  providerId: 'md-to-hwpx'
  toolName: 'export_note' | 'derive_template'
  args: Record<string, unknown>
  expectedDigest: string
  expectedPolicyRevision: number
  beforeCheckpoint?: (preparation: CommitPreparation) => Promise<void>
  context: ProviderExecutionContext & {
    conversationId: string
    runId: string
    turnId: string
  }
}

export type InternalCommitFacts = {
  outcome: AgentToolOutcome
  turnCommit?: TurnCommitFact
  /** Provider-reported preparation facts, not evidence of the eventual write. */
  preparation?: Pick<
    CommitPreparation,
    'preparationId' | 'report' | 'destination' | 'mode' | 'writeSet'
  >
  /** Available only while the callback runs and only for this invocation. */
  getOutputAnchors: (
    preparationId: string,
  ) => SavedOutputAnchorPage[] | undefined
  /** Revalidates the written checkpoint and current lease before returning pages. */
  readBoundAnchors: () => Promise<SavedOutputAnchorPage[] | undefined>
  /** Lease stays private; lookup rechecks the written checkpoint and provider. */
  resolveOutputAnchorRefs: (
    blockIndices: readonly number[],
  ) => Promise<SavedAnchorReference[]>
}

/** Only raised before checkpoint creation and provider execution. */
export class HostCommitNotStarted extends Error {
  constructor(
    readonly code: string,
    readonly readinessCause?: string,
  ) {
    super(code)
  }
}
