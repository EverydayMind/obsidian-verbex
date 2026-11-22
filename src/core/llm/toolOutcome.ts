import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import { ChangeOutcome } from '../../workflow/StepExecutor'

export type AgentToolOutcome = {
  userRejected?: true
  repeatOriginalText?: string
  /** Runtime host boundary only. Never persist or send this state identity. */
  hostBlock?: { code: 'ownership_unverifiable'; stateKey: string }
  images?: import('./toolImages').ToolImage[]
  /** Host provenance: raw browser material is runtime-only, including failures. */
  privateTranscript?: boolean
  status: 'succeeded' | 'rejected' | 'failed' | 'paused'
  /** The harness has reached a deterministic end-state for this tool call. */
  terminal: boolean
  mutation: 'none' | 'applied' | 'partial' | 'unknown'
  /** Vault path an applied change actually wrote, even when the tool args name none. */
  changedPath?: string
  links?: { updated: number; unchanged: number; broken: number; total: number }
  reportStyleReceipt?: {
    path: string
    noteSha256: string
    revision: number
    readback: 'verified' | 'unverified'
    invalidatedTemplate?: { path: string; sha256: string }
    clearedSemanticsCount?: number
  }
  /** Host-confirmed saved document facts, separate from provider text. */
  documentJobReceipt?: {
    jobId: string
    outputPath: string
    sha256: string
    verification: 'complete' | 'unavailable'
    previewMismatch: boolean
    decomposition?: { state: string; cause?: string }
    template?: { path: string; sha256: string; state: string }
    documentFidelity?: 'not_measured_at_runtime'
  }
  decompositionReceipt?: {
    jobId: string
    template: {
      path: string
      sha256: string
      readback: 'verified' | 'unverified'
    }
    text: { path: string; sha256: string; readback: 'verified' | 'unverified' }
  }
  /** Host binary save receipt; safe metadata for UI, turn ledger and export. */
  binaryReceipt?: {
    state: 'prepared' | 'rejected' | 'applied' | 'failed' | 'unknown'
    proposalId: string
    path: string
    checkpointId?: string
    resultHash?: string
    resultSizeBytes?: number
  }
  /**
   * 'none' records no mutation attributed to this call (including a declared
   * native provider read or a call refused before it started). Its
   * failures stay out of the unreported-mutation ledger; the failure text
   * still reaches the model as the tool result. 'provider_session' is an edit
   * of a provider's unsaved working copy: no Vault file changed and no
   * checkpoint exists.
   */
  mutationScope?: 'none' | 'vault' | 'provider_session' | 'browser'
  /** Structural marker for non-applied mutating calls; unrelated to model prose. */
  notApplied?: 'not_executed' | 'observation_step'
  /**
   * Ledger identity of one provider operation. A later result with the same
   * key replaces the entry; without it the loop keys by tool name and path.
   */
  mutationKey?: string
  /** A verified no-change success: clears an earlier failure of the same key. */
  mutationResolution?: 'resolved'
  /** Host-only facts of a provider session edit, for the change card. Never sent to the model. */
  sessionEdit?: import('../../provider/interop/sessionProtocol').SessionEditFact
  /** Host disk observations for a save card. Never authority to repeat the write. */
  commit?: import('../../provider/interop/commitStatus').CommitFact
  verification?: {
    ok: boolean
    ruleSignature?: string
    message?: string
  }
  retry?: { allowed: boolean; hint?: string }
  /** Run artifacts established by the deterministic tool implementation. */
  artifacts?: Record<string, string>
  auditEvent?: {
    kind: 'validation_override_accepted'
    summary: string
  }
  connectorAudit?: import('../../provider/connectors/PluginConnectorHost').ConnectorAudit
  evidence?: { role: 'discovery' | 'reading' | 'none'; paths: string[] }
  disclosure?: import('../../types/llm/request').ConnectorDisclosure
  readFacts?: import('../tools/readFacts').ReadFacts
  documentRead?: import('../large-document/documentReadProgress').DocumentReadFact
  /** Validated call target affected by a concurrent Vault event, not attribution. */
  invalidatedReadTarget?: string
  displayText: string
  /** Unsent native read page; continuation metadata is preserved verbatim. */
  readPage?: {
    text: string
    continuation: string
    recovery?: import('../large-document/readPageRecovery').ReadPageRecovery
  }
  readRecovery?: {
    attempts: number
    maxAttempts: number
    processedCoverage: string
    recovery?: import('../large-document/readPageRecovery').ReadPageRecovery
    allowed: boolean
  }
}

/** Whether a tool result belongs in the mutation ledger (DECISIONS §3). */
export function recordsMutation(outcome: AgentToolOutcome): boolean {
  return outcome.mutationScope !== 'none'
}

/**
 * Files one tool result in the unreported-failure ledger. A provider operation
 * carries its own key, so a retry of the same operation replaces or resolves
 * its earlier failure while another operation's success leaves it in place.
 */
export function recordMutationResult<S extends string>(
  ledger: Map<string, { status: S; text: string }>,
  outcome: AgentToolOutcome,
  fallbackKey: string,
  status: S,
): void {
  const key = outcome.mutationKey ?? fallbackKey
  if (outcome.mutationResolution === 'resolved') ledger.delete(key)
  else if (
    (status !== 'unknown' || outcome.mutation === 'unknown') &&
    recordsMutation(outcome)
  )
    ledger.set(key, { status, text: outcome.displayText })
}

/** A Vault file changed, so the checkpoint and write-permission facts apply. */
export function vaultMutated(outcome: AgentToolOutcome): boolean {
  return (
    (outcome.mutation === 'applied' || outcome.mutation === 'partial') &&
    (outcome.mutationScope === undefined || outcome.mutationScope === 'vault')
  )
}

export function toolSucceeded(
  displayText: string,
  options: Partial<Omit<AgentToolOutcome, 'status' | 'displayText'>> = {},
): AgentToolOutcome {
  return {
    status: 'succeeded',
    terminal: false,
    mutation: 'none',
    displayText,
    ...options,
  }
}

export function toolFailed(
  displayText: string,
  options: Partial<Omit<AgentToolOutcome, 'status' | 'displayText'>> = {},
): AgentToolOutcome {
  return {
    status: 'failed',
    terminal: true,
    mutation: 'none',
    displayText,
    ...options,
  }
}

export function toolRejected(
  displayText: string,
  options: Partial<Omit<AgentToolOutcome, 'status' | 'displayText'>> = {},
): AgentToolOutcome {
  return {
    status: 'rejected',
    terminal: true,
    mutation: 'none',
    displayText,
    ...options,
  }
}

export function toolOutcomeFromChange(
  outcome: ChangeOutcome,
  displayText: string,
  terminal = false,
): AgentToolOutcome {
  switch (outcome.status) {
    case 'applied':
    case 'partially_applied':
      return toolSucceeded(
        outcome.status === 'applied' &&
          !outcome.change.composite &&
          typeof outcome.appliedContent === 'string' &&
          outcome.appliedContent.trim().length === 0
          ? L({
              ko: `${displayText}\n파일 내용이 비워졌습니다. 파일 자체는 삭제되지 않고 ${outcome.change.path}에 그대로 남아 있습니다.`,
              en: `${displayText}\nThe file contents were cleared. The file itself was not deleted and remains at ${outcome.change.path}.`,
            })
          : displayText,
        {
          terminal,
          mutation: outcome.status === 'applied' ? 'applied' : 'partial',
          changedPath: outcome.change.path,
          links: outcome.links,
        },
      )
    case 'rejected':
    case 'denied':
      return toolRejected(
        outcome.rejectedByUser
          ? L({
              ko: `${displayText}\n${modelMarker('harnessFact', 'ko')} 사용자가 이 변경을 거절했습니다. 파일은 바뀌지 않았습니다. 같은 변경이나 표현만 바꾼 변경을 다시 제안하지 마십시오. 다른 변경이 필요한지 모르면 먼저 사용자에게 물으십시오.`,
              en: `${displayText}\n${modelMarker('harnessFact', 'en')} The user rejected this change. The file was not changed. Do not propose the same change or a reworded version again. If you do not know whether another change is needed, ask the user first.`,
            })
          : displayText,
        {
          terminal: true,
          mutationScope: 'vault',
          ...(outcome.rejectedByUser ? { userRejected: true } : {}),
        },
      )
    case 'conflict':
    case 'checkpoint_failed':
    case 'apply_failed':
      return toolFailed(displayText, { terminal: true })
  }
}
