import type { ProviderRuntime } from '../../provider/ToolProviderHub'
import type { RunLifecycle } from '../../runstate/RunLifecycle'
import type { ToolOutcomeRecorder } from '../../runstate/ToolOutcomeRecorder'
import type { AgentWriteVerifier } from '../../verification/AgentWriteVerifier'
import type { StepExecutor } from '../../workflow/StepExecutor'
import type { LargeDocumentCoordinator } from '../large-document/LargeDocumentCoordinator'
import type { ReviewIndexCoordinator } from '../review-index/ReviewIndexCoordinator'

import type { LocalChangeFactProvider } from './applyLocalChange'
import type { LocalChangePreparer } from './localChangePreparation'
import type { LocalToolRegistry } from './localTools'

export type AgentToolPorts = {
  providerRegistry?: ProviderRuntime
  localChangePreparer?: LocalChangePreparer
  localChangeFacts?: LocalChangeFactProvider
  largeDocumentCoordinator: Pick<
    LargeDocumentCoordinator,
    'splitByChapters' | 'transformFile'
  >
  reviewIndexCoordinator: Pick<
    ReviewIndexCoordinator,
    'recoverWikiFolderArtifact' | 'executeRegisteredTool'
  >
  runs: Pick<RunLifecycle, 'loadRunForUpdate'>
  outcomes: Pick<ToolOutcomeRecorder, 'recordToolOutcome'>
  verifier: Pick<
    AgentWriteVerifier,
    'verifyAgentWriteDetailed' | 'formatVerificationWarning'
  >
  localTools: Pick<LocalToolRegistry, 'execute'> &
    Partial<Pick<LocalToolRegistry, 'finalizeReportStyleOutcome'>>
  stepExecutor: Pick<StepExecutor, 'processChange'>
}
