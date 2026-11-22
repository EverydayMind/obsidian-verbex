import { createAgentExecutionPorts } from './agentExecutionPorts'
import { AgentContextPresenter } from './context/AgentContextPresenter'
import { SystemPromptBuilder } from './prompt/SystemPromptBuilder'
import { RunArtifactStore } from './runstate/RunArtifactStore'
import type { VerbexSettings } from './settings/schema/setting.types'
import type { VerbexController } from './VerbexController'

/** Capability adapter: no persistence, status publication, tools, or model calls. */
export function readOnlyAgentPorts(
  host: VerbexController,
  settings: VerbexSettings,
) {
  const ports = createAgentExecutionPorts(host)
  let localEmbeddingUsed = false
  const builder = host.contextBuilder.forkReadOnly(settings, () => {
    localEmbeddingUsed = true
  })
  const blocked = () => {
    throw new Error(
      '[assembly_side_effect] Operation unavailable during request assembly',
    )
  }
  const buildContext: typeof ports.context.buildContext = (
    query,
    currentFile,
    mentionedFiles,
    maxContextTokens,
    omitCurrentNoteBody,
    formatSources,
  ) =>
    builder.build({
      query,
      currentFile,
      mentionedFiles,
      maxContextTokens,
      omitCurrentNoteBody,
      formatSources,
    })
  const prompt = new SystemPromptBuilder(host.getApp(), settings)
  prompt.setPendingPluginApprovalsSource(
    () => host.providerRegistry?.pendingPluginApprovals?.() ?? [],
  )
  return {
    ...ports,
    localEmbeddingUsed: () => localEmbeddingUsed,
    systemPromptBuilder: prompt,
    presenter: new AgentContextPresenter((query, file, budget) =>
      buildContext(query, file, [], budget),
    ),
    settings: { getSettings: () => settings, runWithPinnedSettings: blocked },
    context: {
      ...ports.context,
      buildContext,
      relevanceJudge: blocked,
      transcriptSummarizer: blocked,
    },
    workflow: {
      ...ports.workflow,
      prepareWorkflowRuntime: blocked,
      prepareWorkflowCoverage: blocked,
      persistWorkflowReviewScope: blocked,
      persistAgentResult: blocked,
    },
    reviewIndexCoordinator: {
      ...ports.reviewIndexCoordinator,
      runUnitBatch: blocked,
      recoverWikiFolderArtifact: blocked,
    },
    largeDocumentCoordinator: {
      ...ports.largeDocumentCoordinator,
      prepareAttachments: (
        ...args: Parameters<
          typeof ports.largeDocumentCoordinator.prepareAttachments
        >
      ) => {
        args[12] = true
        return host.largeDocumentCoordinator.prepareAttachments(...args)
      },
    },
    runs: {
      ...ports.runs,
      loadRunForUpdate: (runId: string, title: string) =>
        host.runLifecycle.loadRunReadOnly(runId, title),
      loadRunContextState: async (runId: string) => {
        const run = await host.runLifecycle.loadRunReadOnly(
          runId,
          'Context packet plan',
        )
        return {
          deferState: RunArtifactStore.getContextPackerDeferState(run),
          turns: RunArtifactStore.getTurnLedger(run).records,
        }
      },
      persistAbortedTurn: blocked,
      persistContextExecutionPlan: blocked,
      persistContextPackerDeferState: blocked,
      recordToolOutcome: blocked,
    },
    tools: {
      ...ports.tools,
      executeAgentTool: blocked,
      verifyAgentWriteDetailed: blocked,
    },
  }
}
