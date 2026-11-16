import { publicToolOutcome } from '../core/llm/privateToolTranscript'
import type { AgentToolOutcome } from '../core/llm/toolOutcome'
import type { ToolCallRequest } from '../types/tool-call.types'

import { recordDocumentRead } from './documentReadFacts'
import type { TurnRecord } from './turnLedger'
import { recordTurnToolOutcome } from './turnToolFacts'

const trackers = new WeakMap<TurnRecord, TurnToolTracker>()

type CallFact = { index: number; facts?: TurnRecord; published?: boolean }

/** Call IDs join execution starts to results even when the batch never returns. */
class TurnToolTracker {
  private readonly calls = new Map<string, CallFact>()
  private readonly invocations: CallFact[] = []
  private readonly initial: TurnRecord
  constructor(private readonly record: TurnRecord) {
    this.initial = {
      ...record,
      writes: [...record.writes],
      truncations: [...record.truncations],
      evidence: {
        discovered: [...record.evidence.discovered],
        inspected: [...record.evidence.inspected],
        omitted: [...record.evidence.omitted],
      },
      documentReads: record.documentReads?.slice(),
    }
  }

  start(call: ToolCallRequest): CallFact {
    const current = this.calls.get(call.id)
    if (current && !current.facts) return current
    const entry: CallFact = { index: this.record.toolCalls.length }
    this.calls.set(call.id, entry)
    this.invocations.push(entry)
    this.record.toolCalls.push({
      callId: call.id,
      name: call.name,
      status: 'unknown',
    })
    return entry
  }

  result(
    call: ToolCallRequest,
    outcome: AgentToolOutcome,
    published = false,
  ): void {
    const current = this.calls.get(call.id)
    // A callback-only producer can reuse IDs across distinct calls. An actual
    // execution start creates its own slot; its first publication updates it.
    const entry =
      !current || (published && current.published) ? this.start(call) : current
    if (entry.facts && !published) return
    const safe = publicToolOutcome(outcome)
    const facts: TurnRecord = {
      ...this.record,
      toolCalls: [],
      writes: [],
      truncations: [],
      evidence: { discovered: [], inspected: [], omitted: [] },
      documentReads: undefined,
      documentReadsDropped: undefined,
    }
    recordTurnToolOutcome(facts, call, safe)
    if (
      !safe.privateTranscript &&
      safe.evidence &&
      safe.evidence.role !== 'none'
    ) {
      const key =
        safe.evidence.role === 'discovery' ? 'discovered' : 'inspected'
      facts.evidence[key] = safe.evidence.paths
    }
    entry.facts = facts
    entry.published = published
    this.record.toolCalls[entry.index] = {
      ...facts.toolCalls[0],
      callId: call.id,
    }
    // Publication may replace read-page metadata after digestion. Rebuild facts
    // by call ID rather than appending a second invocation or claiming delivery.
    const completed = [
      this.initial,
      ...this.invocations.flatMap((item) => (item.facts ? [item.facts] : [])),
    ]
    this.record.writes = completed.flatMap((item) => item.writes)
    this.record.truncations = completed.flatMap((item) => item.truncations)
    for (const key of ['discovered', 'inspected', 'omitted'] as const)
      this.record.evidence[key] = [
        ...new Set(completed.flatMap((item) => item.evidence[key])),
      ].slice(0, 200)
    const reads = completed.flatMap((item) => item.documentReads ?? [])
    if (reads.length || this.record.documentReads) {
      this.record.documentReads = []
      this.record.documentReadsDropped =
        completed.some((item) => item.documentReadsDropped) || undefined
      for (const fact of reads) recordDocumentRead(this.record, fact)
    }
  }

  async execute(
    call: ToolCallRequest,
    work: () => Promise<AgentToolOutcome>,
    privateTranscript = false,
  ): Promise<AgentToolOutcome> {
    this.start(call)
    const outcome = await work()
    this.result(
      call,
      privateTranscript ? { ...outcome, privateTranscript: true } : outcome,
    )
    return outcome
  }
}

export function turnToolTracker(record: TurnRecord): TurnToolTracker {
  let tracker = trackers.get(record)
  if (!tracker) trackers.set(record, (tracker = new TurnToolTracker(record)))
  return tracker
}

/** Freeze the execution facts before awaiting storage; a late result cannot rewrite them. */
export function abortedTurnRecord(record: TurnRecord): TurnRecord {
  return JSON.parse(
    JSON.stringify({
      ...record,
      completedAt: Date.now(),
      stoppedReason: 'aborted',
    }),
  ) as TurnRecord
}
