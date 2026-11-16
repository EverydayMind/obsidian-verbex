import { normalizePath } from 'obsidian'

import { parseToolArgs } from '../core/tools/parseToolArgs'
import { L } from '../i18n/modelText'
import type { ChatWorkflowContextItem } from '../types/chat'
import type { ToolCallRequest } from '../types/tool-call.types'

import { verifyStepOutput } from './VerificationEngine'

export type AgentWriteVerificationFailure = {
  workflowId: string
  workflowName: string
  stepId?: string
  ruleSignature: string
  missingSections: string[]
  invalidQuotes: string[]
  missingCoverage: string[]
  invalidCitations: string[]
  messages: string[]
}

/** Collects workflow write facts without blocking mutations. */
export class AgentWriteVerifier {
  constructor(private getMarkdownFiles: () => readonly { path: string }[]) {}
  private extractVaultCitations(text: string): string[] {
    const citations: string[] = []
    for (const match of text.matchAll(
      /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g,
    )) {
      if (match[1]?.trim()) citations.push(match[1].trim())
    }
    for (const match of text.matchAll(
      /\[[^\]]*\]\(([^)]+\.md)(?:#[^)]+)?\)/gi,
    )) {
      if (match[1]?.trim()) citations.push(match[1].trim())
    }
    return [...new Set(citations)]
  }

  /** Enforce selected workflow output contracts before opening a write Diff. @internal */
  verifyAgentWriteDetailed(
    call: ToolCallRequest,
    workflows: ChatWorkflowContextItem[],
    activeStepId?: string,
  ): AgentWriteVerificationFailure | null {
    if (call.name !== 'write_file') return null
    const args = parseToolArgs(call.arguments)
    const content = typeof args.content === 'string' ? args.content : ''
    if (!content) return null // LocalToolRegistry reports the malformed call.
    const path =
      typeof args.path === 'string' ? normalizePath(args.path.trim()) : ''
    const vaultPaths = new Set(this.getMarkdownFiles().map((file) => file.path))
    const included = workflows.filter((workflow) => workflow.included)
    const stepCandidates = included.flatMap((workflow) =>
      (workflow.steps ?? [])
        .filter((step) => step.verification)
        .map((step) => ({ workflow, step })),
    )
    const activeCandidates = activeStepId
      ? stepCandidates.filter(({ step }) => step.id === activeStepId)
      : []
    const pathCandidates = stepCandidates.filter(
      ({ step }) =>
        step.tool === call.name &&
        Boolean(step.outputPath) &&
        normalizePath(step.outputPath ?? '') === path,
    )
    const selected =
      activeCandidates.length > 0 ? activeCandidates : pathCandidates

    if (selected.length > 1) {
      const ids = selected.map(
        ({ workflow, step }) => `${workflow.id}:${step.id}`,
      )
      return {
        workflowId: 'ambiguous',
        workflowName: 'Ambiguous workflow contract',
        ruleSignature: `ambiguous:${ids.sort().join(',')}`,
        missingSections: [],
        invalidQuotes: [],
        missingCoverage: [],
        invalidCitations: [],
        messages: [
          `Multiple workflow steps match this write: ${ids.join(', ')}.`,
        ],
      }
    }

    const legacy = included
      .filter((workflow) => workflow.verification)
      .map((workflow) => ({
        workflow,
        step: undefined,
        verification: workflow.verification,
      }))
    const contracts =
      selected.length === 1
        ? selected.map(({ workflow, step }) => ({
            workflow,
            step,
            verification: step.verification,
          }))
        : stepCandidates.length === 0
          ? legacy
          : []

    for (const { workflow, step, verification } of contracts) {
      if (!verification) continue
      const result = verifyStepOutput(
        {
          ...verification,
          requiredArtifacts: [],
          requireCheckpoint: false,
        },
        {
          text: content,
          artifacts: {},
          citedPaths: this.extractVaultCitations(content),
          checkpointCreated: false,
          vaultPaths,
        },
      )
      if (result.ok) continue
      const missingSections = result.failures
        .filter((failure) => failure.type === 'missing_section')
        .map((failure) => failure.message)
      const invalidCitations = result.failures
        .filter(
          (failure) =>
            failure.type === 'missing_citation' ||
            failure.type === 'broken_citation',
        )
        .map((failure) => failure.message)
      return {
        workflowId: workflow.id,
        workflowName: workflow.name,
        ...(step ? { stepId: step.id } : {}),
        ruleSignature: [
          workflow.id,
          step?.id ?? 'legacy',
          ...result.failures.map((failure) => failure.type).sort(),
        ].join(':'),
        missingSections,
        invalidQuotes: [],
        missingCoverage: [],
        invalidCitations,
        messages: result.failures.map((failure) => failure.message),
      }
    }
    return null
  }

  /** @internal — 검증 실패 내용을 채팅 배지로 포맷 */
  formatVerificationWarning(failure: AgentWriteVerificationFailure): string {
    const body = failure.messages.join(' ')
    return L({
      ko: `[⚠ 검증 경고] ${failure.workflowName} · ${failure.stepId ?? 'legacy'}: ${body}`,
      en: `[⚠ Verification warning] ${failure.workflowName} · ${failure.stepId ?? 'legacy'}: ${body}`,
    })
  }
}
