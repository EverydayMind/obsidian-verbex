import { normalizePath } from 'obsidian'

import type { HwpEditScope } from '../../provider/contract'
import { dispatchDocumentJob } from '../../provider/interop/documentJobDispatch'
import { executeProviderAgentTool } from '../../provider/prepareProviderTools'
import type { ProviderRegistrySnapshot } from '../../provider/providerTurnTypes'
import { RunArtifactStore } from '../../runstate/RunArtifactStore'
import type { ChatWorkflowContextItem } from '../../types/chat'
import type { ToolCallRequest } from '../../types/tool-call.types'
import { summarizeOutcome } from '../../utils/changeOutcome'
import type { BatchContract } from '../batch/contracts'
import type { LargeOperationConfirm } from '../large-document/LargeDocumentCoordinator'
import type {
  AgentLoopStatus,
  AgentToolExecutionResult,
} from '../llm/agentLoop'
import { toolFailed, toolOutcomeFromChange } from '../llm/toolOutcome'
import type { WikiTargetConfirm } from '../review-index/ReviewIndexCoordinator'

import type { AgentToolPorts } from './AgentToolExecutorPorts'
import {
  executorMissingArtifact,
  executorMissingTransformArgs,
  executorNoChange,
  executorProposedError,
  executorTransformPrefix,
  executorTransformed,
  executorUnavailable,
} from './agentToolExecutorText'
import { hostToolAiPrivateRefusal } from './aiPrivateLocalRead'
import { applyLocalChange } from './applyLocalChange'
import {
  binaryDocumentWriteError,
  hasBatchPathConflict,
} from './batchToolPaths'
import { parseToolArgs } from './parseToolArgs'
import { nonChangeResultOutcome } from './readOutcome'
import { resolveDocumentJobLocalPorts } from './resolveDocumentJobLocalPorts'
import {
  AGENT_CALLABLE_TOOL_NAMES,
  TOOL_REGISTRY,
  getToolCatalog,
} from './toolDefinitions'
import { normalizeLocalToolCall, unknownToolArgs } from './unknownToolArgs'

/** Owns native tool dispatch and the permission/checkpoint/apply path. */
export class AgentToolExecutor {
  constructor(private ports: AgentToolPorts) {}
  parseToolArgs(args?: string): Record<string, unknown> {
    return parseToolArgs(args)
  }

  /**
   * ToolCallRequest의 wiki_folder 인자를 확정된 artifact 값으로 교체합니다.
   * 원본 call을 변형하지 않고 새 객체를 반환합니다.
   */
  private rebindArtifact(
    call: ToolCallRequest,
    argument: string,
    artifactValue: string,
  ): ToolCallRequest {
    const args = this.parseToolArgs(call.arguments)
    const currentVal = args[argument]
    if (currentVal === artifactValue) return call
    const patched = { ...args, [argument]: artifactValue }
    return { ...call, arguments: JSON.stringify(patched) }
  }

  async executeAgentTool(
    runId: string,
    call: ToolCallRequest,
    workflows: ChatWorkflowContextItem[] = [],
    onStatusChange?: (status: AgentLoopStatus) => void,
    signal?: AbortSignal,
    confirmLargeOperation?: LargeOperationConfirm,
    activeStepId?: string,
    confirmWikiTarget?: WikiTargetConfirm,
    activeSkills: {
      tools?: string[]
      crossDocument?: boolean
      batch?: BatchContract
    }[] = [],
    openAppliedNotes?: boolean,
    providerSnapshot?: ProviderRegistrySnapshot,
    companionScope?: HwpEditScope,
    rejectionNotes?: Parameters<typeof applyLocalChange>[0]['rejectionNotes'],
  ): Promise<AgentToolExecutionResult> {
    call = normalizeLocalToolCall(
      call,
      (name) => this.ports.providerRegistry?.hasTool(name) === true,
    )

    const providerRegistry = this.ports.providerRegistry
    const providerTool = providerRegistry?.hasTool(call.name) === true
    if (!AGENT_CALLABLE_TOOL_NAMES.has(call.name) && !providerTool) {
      return toolFailed(executorUnavailable(call.name))
    }
    if (providerTool)
      return executeProviderAgentTool(
        providerRegistry,
        call,
        runId,
        providerSnapshot,
        companionScope,
        signal,
      )
    const refused = hostToolAiPrivateRefusal(call.name, call.arguments)
    if (refused) return refused
    if (
      call.name === 'prepare_format_reuse' ||
      call.name === 'save_format_decomposition' ||
      call.name === 'produce_format_reuse'
    )
      return dispatchDocumentJob(
        providerRegistry?.native,
        call.name,
        this.parseToolArgs(call.arguments),
        runId,
        call.id,
        providerSnapshot,
        signal,
      )
    const unknownArgs = unknownToolArgs(
      call.name,
      this.parseToolArgs(call.arguments),
      getToolCatalog().registry[call.name]?.definition,
    )
    if (unknownArgs) return toolFailed(unknownArgs, { mutationScope: 'none' })
    const binaryWriteError = binaryDocumentWriteError(call)
    if (binaryWriteError) return toolFailed(binaryWriteError)
    if (call.name === 'transform_large_file') {
      return this.executeLargeFileTransform(
        runId,
        call,
        onStatusChange,
        signal,
        confirmLargeOperation,
      )
    }
    if (call.name === 'split_file_by_chapters') {
      return this.ports.largeDocumentCoordinator.splitByChapters(runId, call)
    }
    const workflowAutoApply = workflows.some(
      (wf) => wf.included && wf.autoApply,
    )
    const workflow = workflows.find((candidate) => candidate.included)
    const activeWorkflowStep = workflow?.steps?.find(
      (step) => step.id === activeStepId,
    )
    const resolvedOpenAppliedNotes =
      openAppliedNotes ?? activeWorkflowStep?.openOutput ?? true
    const buildWorkflowStep = workflow?.steps?.find(
      (step) => step.tool === 'build_review_index',
    )
    // 실행 경계: registry의 artifactBinding이 있으면 모델 인자를 덮어씁니다.
    const registryEntry = TOOL_REGISTRY[call.name]
    if (registryEntry?.artifactBinding) {
      const { argument, mode } = registryEntry.artifactBinding
      const run = await this.ports.runs.loadRunForUpdate(
        runId,
        `${argument} binding`,
      )
      const artifactKey = buildWorkflowStep?.outputArtifact ?? argument
      let artifactFolder: string | null = null
      if (argument === 'index_folder') {
        artifactFolder = RunArtifactStore.getIndexFolder(run)
      } else {
        artifactFolder = RunArtifactStore.getArtifact(run, artifactKey)
      }
      if (!artifactFolder) {
        artifactFolder =
          (await this.ports.reviewIndexCoordinator.recoverWikiFolderArtifact(
            run,
          )) ?? null
      }

      if (mode === 'hard') {
        // Hard bind: artifact 필수. 없으면 즉시 실패.
        if (!artifactFolder) {
          return toolFailed(executorMissingArtifact(argument))
        }
        call = this.rebindArtifact(call, argument, artifactFolder)
      } else {
        // Soft bind: artifact 존재 시에만 덮어씁니다.
        if (artifactFolder) {
          call = this.rebindArtifact(call, argument, artifactFolder)
        }
      }
    }
    const executorArgument = registryEntry?.executorArgument
    if (
      registryEntry?.executor === 'review-index' &&
      (!executorArgument ||
        typeof this.parseToolArgs(call.arguments)[executorArgument] ===
          'string')
    ) {
      return this.ports.reviewIndexCoordinator.executeRegisteredTool({
        runId,
        call,
        workflow,
        activeStepId,
        activeSkills,
        confirmWikiTarget,
        autoApply: workflowAutoApply,
        openAppliedNotes: resolvedOpenAppliedNotes,
      })
    }
    // 검증은 사실 수집만 — 실패해도 쓰기를 막지 않는다 (facts-not-judgments)
    const verificationFailure = this.ports.verifier.verifyAgentWriteDetailed(
      call,
      workflows,
      activeStepId,
    )
    const result = await this.ports.localTools.execute(
      call.name,
      this.parseToolArgs(call.arguments),
      { runId, signal, snapshot: providerSnapshot },
    )
    if (result.kind !== 'change')
      return nonChangeResultOutcome(result, call.name)
    const documentPorts = resolveDocumentJobLocalPorts(
      this.ports,
      providerSnapshot,
    )
    return applyLocalChange({
      runId,
      result,
      rejectionNotes,
      ...documentPorts,
      conversationId: providerSnapshot?.caller?.conversationId,
      signal,
      stepExecutor: this.ports.stepExecutor,
      outcomes: this.ports.outcomes,
      openAppliedNotes: openAppliedNotes ?? true,
      verificationWarning: verificationFailure
        ? this.ports.verifier.formatVerificationWarning(verificationFailure)
        : undefined,
      finalize: this.ports.localTools.finalizeReportStyleOutcome?.bind(
        this.ports.localTools,
      ) as Parameters<typeof applyLocalChange>[0]['finalize'],
    })
  }

  private async executeLargeFileTransform(
    runId: string,
    call: ToolCallRequest,
    onStatusChange?: (status: AgentLoopStatus) => void,
    signal?: AbortSignal,
    confirmLargeOperation?: LargeOperationConfirm,
  ): Promise<AgentToolExecutionResult> {
    const args = this.parseToolArgs(call.arguments)
    const path =
      typeof args.path === 'string' ? normalizePath(args.path.trim()) : ''
    const instruction =
      typeof args.instruction === 'string' ? args.instruction.trim() : ''
    if (!path || !instruction) return toolFailed(executorMissingTransformArgs())
    const transformed = await this.ports.largeDocumentCoordinator.transformFile(
      {
        runId,
        path,
        instruction,
        signal,
        onStatusChange,
        confirmLargeOperation,
      },
    )
    if (transformed.kind !== 'success') {
      const prefix = executorTransformPrefix(transformed.kind === 'cancelled')
      return transformed.kind === 'cancelled'
        ? {
            status: 'rejected',
            terminal: true,
            mutation: 'none',
            displayText: `(${prefix}: ${transformed.message})`,
          }
        : toolFailed(`(${prefix}: ${transformed.message})`)
    }
    const proposed = await this.ports.localTools.execute('update_file', {
      path: transformed.path,
      content: transformed.text,
      append: false,
    })
    if (proposed.kind === 'error')
      return toolFailed(executorProposedError(proposed.message))
    if (proposed.kind !== 'change') return toolFailed(executorNoChange())
    const outcome = await this.ports.stepExecutor.processChange(
      runId,
      proposed.change,
    )
    await this.ports.outcomes.recordToolOutcome(runId, outcome)
    return toolOutcomeFromChange(
      outcome,
      executorTransformed(summarizeOutcome(outcome), transformed.chunkCount),
    )
  }

  hasBatchPathConflict(calls: ToolCallRequest[]): boolean {
    return hasBatchPathConflict(calls)
  }
}
