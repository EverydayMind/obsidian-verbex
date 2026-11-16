import { VERBEX_BUILD_INFO } from '../buildInfo'
import type { AgentLoopDeps, AgentLoopResult } from '../core/llm/agentLoop'
import { explicitlyNamedTools } from '../core/tools/explicitToolMentions'
import { randomUUID } from '../platform/node/api'

import type { TurnCommitFact } from './commitTurnFacts'
import { turnToolTracker } from './turnToolTracker'

export type TurnRecord = {
  v: 1
  turnId: string
  /** Unique per execution; absent only in legacy records. */
  executionId?: string
  startedAt: number
  completedAt: number
  buildSource: string
  modelId: string
  bareContinuation: boolean
  /** Builder selection, rendering policy, and final packet disposition are distinct. */
  contextDelivery?: import('./contextDelivery').ContextDelivery
  exposedTools: string[]
  explicitTools: string[]
  toolCalls: {
    callId?: string
    name: string
    status: string
    mutation?: import('../core/llm/toolOutcome').AgentToolOutcome['mutation']
    mutationScope?: import('../core/llm/toolOutcome').AgentToolOutcome['mutationScope']
    completeness?: string
    errorCode?: string
    target?: string
    commit?: TurnCommitFact
    binaryReceipt?: import('../core/llm/toolOutcome').AgentToolOutcome['binaryReceipt']
    reportStyleReceipt?: import('../core/llm/toolOutcome').AgentToolOutcome['reportStyleReceipt']
    documentJobReceipt?: import('../core/llm/toolOutcome').AgentToolOutcome['documentJobReceipt']
    decompositionReceipt?: import('../core/llm/toolOutcome').AgentToolOutcome['decompositionReceipt']
  }[]
  evidence: { discovered: string[]; inspected: string[]; omitted: string[] }
  truncations: {
    tool: string
    total?: number
    returned?: number
    nextOffset?: number
    target?: string
    /** Offset the page started at; with total, merges pages across turns. */
    offset?: number
    /** Host coverage of an exhaustive snapshot query (RW-06). */
    coverage?: import('../core/tools/propertyQuerySession').QueryCoverage
  }[]
  documentJobPending?: import('../context/documentJobPendingFacts').DocumentJobPending[]
  writes: { tool: string; path: string; mutation: string }[]
  documentJobPreparation?: {
    retryOf?: string
    referenceSource?: import('../context/documentJobReferences').DocumentJobReferenceSource
    /** Optional only for records saved before structural preparation. */
    trigger?: 'explicit' | 'structural'
    execution?: 'executed' | 'reused' | 'not_executed'
    samplePath: string
    result: Record<string, unknown>
  }
  documentReads?: import('../core/large-document/documentReadProgress').DocumentReadFact[]
  documentReadsDropped?: boolean
  stoppedReason: string
}
export type TurnLedger = { v: 1; records: TurnRecord[]; droppedTurns: number }
export const TURN_LEDGER_LIMIT = 30

export function beginTurnRecord(
  input: {
    runId: string
    submittedTurnId?: string
    request: string
    turnRecord?: TurnRecord
    onToolResult?: AgentLoopDeps['onToolResult']
  },
  modelId: string,
): TurnRecord {
  const now = Date.now()
  const record: TurnRecord = {
    v: 1,
    executionId: randomUUID(),
    turnId:
      input.submittedTurnId ??
      `${input.runId}:${now}:${Math.random().toString(36).slice(2)}`,
    startedAt: now,
    completedAt: now,
    buildSource: VERBEX_BUILD_INFO.source,
    modelId,
    bareContinuation: false,
    exposedTools: [],
    explicitTools: explicitlyNamedTools(input.request),
    toolCalls: [],
    evidence: { discovered: [], inspected: [], omitted: [] },
    truncations: [],
    writes: [],
    stoppedReason: 'running',
  }
  const notify = input.onToolResult
  input.turnRecord = record
  input.onToolResult = (call, text, outcome) => {
    if (outcome) {
      turnToolTracker(record).result(call, outcome, true)
    }
    notify?.(call, text, outcome)
  }
  return record
}

export function finishTurnRecord(
  record: TurnRecord | undefined,
  result: AgentLoopResult,
  fallbackId: string,
): TurnRecord {
  const now = Date.now()
  const base = record ?? {
    v: 1 as const,
    turnId: fallbackId,
    executionId: randomUUID(),
    startedAt: now,
    completedAt: now,
    buildSource: VERBEX_BUILD_INFO.source,
    modelId: 'unknown',
    bareContinuation: false,
    exposedTools: [],
    explicitTools: [],
    toolCalls: [],
    evidence: { discovered: [], inspected: [], omitted: [] },
    truncations: [],
    writes: [],
    stoppedReason: result.stoppedReason,
  }
  return {
    ...base,
    completedAt: now,
    stoppedReason: result.stoppedReason,
    evidence: {
      discovered: [...new Set(result.evidence.discoveredPaths)].slice(0, 200),
      inspected: [...new Set(result.evidence.inspectedPaths)].slice(0, 200),
      omitted: [...new Set(base.evidence.omitted)]
        .filter((p) => !result.evidence.inspectedPaths.includes(p))
        .slice(0, 200),
    },
  }
}
