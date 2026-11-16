import type { CoverageDecision } from '../core/routing/scopeDecision'

export type ContextMode = 'auto' | 'full' | 'catalog' | 'off'
export type EffectiveContextMode = Exclude<ContextMode, 'auto'>

export type ContextPolicy = {
  requestedMode: ContextMode
  effectiveMode: EffectiveContextMode
  source: 'setting' | 'turn_override' | 'auto' | 'fallback'
  automaticRetrieval: boolean
  preserveWorkflowRegrounding: boolean
  preserveExplicitAttachments: boolean
  preserveDigest: boolean
  requireToolCall: boolean
  reason: string
}

export type ContextPolicyInput = {
  configuredMode: ContextMode
  turnOverride?: ContextMode
  isFirstTurn: boolean
  bareContinuation: boolean
  toolsEnabled: boolean
  modelSupportsTools: boolean
  activeWorkflow: boolean
  selfContainedWorkflowTool: boolean
  hasExplicitAttachments: boolean
  hasCurrentNoteDigest: boolean
  hasCurrentFile: boolean
  scopeDecision: Pick<CoverageDecision, 'coverage' | 'operation'>
}

function needsEvidence(
  scopeDecision: Pick<CoverageDecision, 'coverage' | 'operation'>,
): boolean {
  return (
    scopeDecision.coverage === 'whole' ||
    scopeDecision.operation === 'analysis' ||
    scopeDecision.operation === 'extract'
  )
}

/**
 * Resolve the automatic context contract after TurnPlanner has produced the
 * execution plan. This function is deliberately pure: it does not inspect
 * prompts, call providers, or mutate settings.
 */
export function resolveContextPolicy(input: ContextPolicyInput): ContextPolicy {
  const requestedMode = input.turnOverride ?? input.configuredMode
  const source = input.turnOverride ? 'turn_override' : 'setting'
  const preserveWorkflowRegrounding =
    input.activeWorkflow && !input.selfContainedWorkflowTool
  const preserveExplicitAttachments = input.hasExplicitAttachments
  const preserveDigest = input.hasCurrentNoteDigest
  const toolCapable = input.toolsEnabled && input.modelSupportsTools
  const evidenceTask = needsEvidence(input.scopeDecision)

  let effectiveMode: EffectiveContextMode
  let resolvedSource: ContextPolicy['source'] = source
  let reason: string

  if (requestedMode === 'auto') {
    if (!toolCapable) {
      effectiveMode = 'full'
      resolvedSource = 'fallback'
      reason = 'auto_fallback_model_or_tools_cannot_retrieve'
    } else if (preserveExplicitAttachments) {
      effectiveMode = 'full'
      reason = 'auto_preserve_explicit_attachments'
    } else if (preserveWorkflowRegrounding) {
      effectiveMode = 'full'
      reason = 'auto_preserve_workflow_grounding'
    } else if (evidenceTask) {
      effectiveMode = 'catalog'
      reason = 'auto_evidence_task_catalog'
    } else if (input.hasCurrentFile) {
      effectiveMode = 'full'
      reason = 'auto_current_note_focused'
    } else {
      effectiveMode = 'catalog'
      reason = 'auto_catalog_default'
    }
  } else if (requestedMode === 'catalog' && !toolCapable) {
    effectiveMode = 'full'
    resolvedSource = 'fallback'
    reason = 'catalog_fallback_model_or_tools_cannot_retrieve'
  } else {
    effectiveMode = requestedMode
    reason = `explicit_${requestedMode}`
  }

  const automaticRetrieval =
    input.isFirstTurn &&
    !input.selfContainedWorkflowTool &&
    effectiveMode !== 'off'

  return {
    requestedMode,
    effectiveMode,
    source: resolvedSource,
    automaticRetrieval,
    preserveWorkflowRegrounding,
    preserveExplicitAttachments,
    preserveDigest,
    requireToolCall:
      !input.bareContinuation &&
      toolCapable &&
      (effectiveMode === 'catalog' || effectiveMode === 'off') &&
      evidenceTask,
    reason,
  }
}

/** Keep legacy autoContext overrides working for callers/tests that construct
 * settings objects directly instead of passing through schema migration. */
export function resolveConfiguredContextMode(context: {
  firstTurnMode?: ContextMode
  autoContext?: boolean
}): ContextMode {
  if (context.autoContext === false) return 'off'
  return context.firstTurnMode ?? 'full'
}
