import {
  judgeIrrelevantReads,
  summarizeAgentTranscript,
} from './context/agentModelCalls'
import {
  referencedConversationPaths,
  resolveReferencedVaultDocuments,
} from './context/referencedDocuments'
import type { RunLifecycle } from './runstate/RunLifecycle'
import type { VerbexSettings } from './settings/schema/setting.types'
import type { VerbexController } from './VerbexController'
import type { WorkflowCoordinator } from './workflow/WorkflowCoordinator'

/** Composition adapter. Execution receives capabilities, never the controller.
 * Closures preserve late-bound facade behavior and the existing safety gates.
 * Each domain exposes only the operations needed for one agent turn.
 */
export function createAgentExecutionPorts(host: VerbexController) {
  return {
    findFile: (path: string) => host.getApp().vault.getFileByPath(path),
    providerRegistry: host.providerRegistry,
    presenter: host.agentContext,
    reviewIndexCoordinator: {
      decidedWikiFolderWithChecklist: (
        ...args: Parameters<
          VerbexController['reviewIndexCoordinator']['decidedWikiFolderWithChecklist']
        >
      ) => host.reviewIndexCoordinator.decidedWikiFolderWithChecklist(...args),
      recoverWikiFolderArtifact: (
        ...args: Parameters<
          VerbexController['reviewIndexCoordinator']['recoverWikiFolderArtifact']
        >
      ) => host.reviewIndexCoordinator.recoverWikiFolderArtifact(...args),
      runUnitBatch: (
        ...args: Parameters<
          VerbexController['reviewIndexCoordinator']['runUnitBatch']
        >
      ) => host.reviewIndexCoordinator.runUnitBatch(...args),
      getWikiDecision: (
        ...args: Parameters<
          VerbexController['reviewIndexCoordinator']['getWikiDecision']
        >
      ) => host.reviewIndexCoordinator.getWikiDecision(...args),
      probeWikiFolder: (
        ...args: Parameters<
          VerbexController['reviewIndexCoordinator']['probeWikiFolder']
        >
      ) => host.reviewIndexCoordinator.probeWikiFolder(...args),
    },
    largeDocumentCoordinator: {
      prepareAttachments: (
        ...args: Parameters<
          VerbexController['largeDocumentCoordinator']['prepareAttachments']
        >
      ) => host.largeDocumentCoordinator.prepareAttachments(...args),
      formatDigests: (
        ...args: Parameters<
          VerbexController['largeDocumentCoordinator']['formatDigests']
        >
      ) => host.largeDocumentCoordinator.formatDigests(...args),
      formatSourceInventory: (
        ...args: Parameters<
          VerbexController['largeDocumentCoordinator']['formatSourceInventory']
        >
      ) => host.largeDocumentCoordinator.formatSourceInventory(...args),
      formatResultBadge: (
        ...args: Parameters<
          VerbexController['largeDocumentCoordinator']['formatResultBadge']
        >
      ) => host.largeDocumentCoordinator.formatResultBadge(...args),
    },
    systemPromptBuilder: host.systemPromptBuilder,
    localTools: host.localTools,
    stepExecutor: host.stepExecutor,
    settings: {
      getSettings: (...args: Parameters<VerbexController['getSettings']>) =>
        host.getSettings(...args),
      runWithPinnedSettings: <T>(pin: VerbexSettings, fn: () => Promise<T>) =>
        host.runWithPinnedSettings(pin, fn),
    },
    context: {
      buildContext: (
        ...args: Parameters<
          VerbexController['contextRetrieval']['buildContext']
        >
      ) => host.contextRetrieval.buildContext(...args),
      resolveMentionedFiles: (
        ...args: Parameters<VerbexController['resolveMentionedFiles']>
      ) => host.resolveMentionedFiles(...args),
      resolveReferencedFiles: (request: string) =>
        resolveReferencedVaultDocuments(host.getApp(), request),
      referencedPaths: (
        request: string,
        prior: Parameters<typeof referencedConversationPaths>[2],
      ) => referencedConversationPaths(host.getApp(), request, prior),
      formatFolderInventory: (
        ...args: Parameters<VerbexController['formatFolderInventory']>
      ) => host.formatFolderInventory(...args),
      selfContainedSourceArguments: (
        ...args: Parameters<VerbexController['selfContainedSourceArguments']>
      ) => host.selfContainedSourceArguments(...args),
      relevanceJudge:
        (
          input: { runId: string; signal?: AbortSignal },
          turnId: string,
          approvedConnectorVaultRead: boolean,
        ) =>
        (judgeInput: Parameters<typeof judgeIrrelevantReads>[1]) =>
          judgeIrrelevantReads(host.getSettings(), judgeInput, input.signal, {
            runId: input.runId,
            turnId,
            approvedConnectorVaultRead,
          }),
      transcriptSummarizer:
        (
          input: { runId: string; signal?: AbortSignal },
          turnId: string,
          approvedConnectorVaultRead: boolean,
        ) =>
        (
          transcript: string,
          disclosure?: Parameters<typeof summarizeAgentTranscript>[3],
        ) =>
          summarizeAgentTranscript(
            host.getSettings(),
            transcript,
            input.signal,
            disclosure,
            {
              runId: input.runId,
              turnId,
              approvedConnectorVaultRead,
            },
          ),
    },
    // Workflow and run state are owned by their coordinators, not the facade.
    workflow: {
      getChecklistResumeState: (
        ...args: Parameters<WorkflowCoordinator['getChecklistResumeState']>
      ) => host.workflowCoordinator.getChecklistResumeState(...args),
      prepareWorkflowRuntime: (
        ...args: Parameters<WorkflowCoordinator['prepareRuntime']>
      ) => host.workflowCoordinator.prepareRuntime(...args),
      persistAgentResult: (
        ...args: Parameters<WorkflowCoordinator['persistAgentResult']>
      ) => host.workflowCoordinator.persistAgentResult(...args),
      persistWorkflowReviewScope: (
        ...args: Parameters<WorkflowCoordinator['persistReviewScope']>
      ) => host.workflowCoordinator.persistReviewScope(...args),
      loadWorkflowReviewScope: (
        ...args: Parameters<WorkflowCoordinator['loadReviewScope']>
      ) => host.workflowCoordinator.loadReviewScope(...args),
      activeWorkflowGuidance: (
        ...args: Parameters<WorkflowCoordinator['activeGuidance']>
      ) => host.workflowCoordinator.activeGuidance(...args),
      prepareWorkflowCoverage: (
        ...args: Parameters<WorkflowCoordinator['prepareCoverage']>
      ) => host.workflowCoordinator.prepareCoverage(...args),
      validateCoverageReviewOutput: (
        ...args: Parameters<WorkflowCoordinator['validateCoverageOutput']>
      ) => host.workflowCoordinator.validateCoverageOutput(...args),
    },
    runs: {
      persistAbortedTurn: (
        ...args: Parameters<RunLifecycle['persistAbortedTurn']>
      ) => host.runLifecycle.persistAbortedTurn(...args),
      loadRunForUpdate: (
        ...args: Parameters<RunLifecycle['loadRunForUpdate']>
      ) => host.runLifecycle.loadRunForUpdate(...args),
      loadRunContextState: (
        ...args: Parameters<RunLifecycle['loadContextState']>
      ) => host.runLifecycle.loadContextState(...args),
      persistContextExecutionPlan: (
        ...args: Parameters<RunLifecycle['persistContextExecutionPlan']>
      ) => host.runLifecycle.persistContextExecutionPlan(...args),
      persistContextPackerDeferState: (
        ...args: Parameters<RunLifecycle['persistContextPackerDeferState']>
      ) => host.runLifecycle.persistContextPackerDeferState(...args),
      recordToolOutcome: (
        ...args: Parameters<
          VerbexController['toolOutcomes']['recordToolOutcome']
        >
      ) => host.toolOutcomes.recordToolOutcome(...args),
    },
    tools: {
      executeAgentTool: (
        ...args: Parameters<VerbexController['agentTools']['executeAgentTool']>
      ) => host.agentTools.executeAgentTool(...args),
      parseToolArgs: (
        ...args: Parameters<VerbexController['agentTools']['parseToolArgs']>
      ) => host.agentTools.parseToolArgs(...args),
      hasBatchPathConflict: (
        ...args: Parameters<
          VerbexController['agentTools']['hasBatchPathConflict']
        >
      ) => host.agentTools.hasBatchPathConflict(...args),
      verifyAgentWriteDetailed: (
        ...args: Parameters<
          VerbexController['agentWriteVerifier']['verifyAgentWriteDetailed']
        >
      ) => host.agentWriteVerifier.verifyAgentWriteDetailed(...args),
      formatVerificationWarning: (
        ...args: Parameters<
          VerbexController['agentWriteVerifier']['formatVerificationWarning']
        >
      ) => host.agentWriteVerifier.formatVerificationWarning(...args),
    },
  }
}

export type AgentExecutionPorts = ReturnType<typeof createAgentExecutionPorts>
