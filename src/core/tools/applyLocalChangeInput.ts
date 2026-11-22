import type { RejectionNotesPort } from '../../context/rejectedChangeNotes'
import type { ToolOutcomeRecorder } from '../../runstate/ToolOutcomeRecorder'
import type { ChangeOutcome, StepExecutor } from '../../workflow/StepExecutor'
import type { AgentToolOutcome } from '../llm/toolOutcome'

import type { LocalChangeFactProvider } from './localChangeFacts'
import type { LocalChangePreparer } from './localChangePreparation'
import type { ToolResult } from './localToolCommon'

export type ApplyLocalChangeInput = {
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
  rejectionNotes?: RejectionNotesPort
  finalize?: (
    outcome: ChangeOutcome,
    base: AgentToolOutcome,
    runId: string,
  ) => Promise<AgentToolOutcome>
}
