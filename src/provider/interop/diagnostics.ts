import { VERBEX_BUILD_INFO } from '../../buildInfo'
import type { AgentToolOutcome } from '../../core/llm/toolOutcome'
import type { ProviderExecutionContext } from '../ProviderRegistry'

import {
  type DiagnosticFields,
  type DiagnosticOperation,
  type DiagnosticSpan,
  type DiagnosticStage,
  type DiagnosticEvent as Event,
  aliases,
  booleans,
  errorCodes,
  numbers,
  states,
} from './diagnosticFields'
import {
  ExposureDiagnosticBuffer,
  type ExposureSubmissionFact,
  type ExposureWireFact,
  diagnosticJsonBytes,
} from './exposureDiagnosticBuffer'
export type { DiagnosticFields, DiagnosticSpan } from './diagnosticFields'
const now = () => performance.now()

/** Fixed metadata only. No arguments, document text, tokens, raw errors or raw paths. */
export class InteropDiagnostics {
  tool(
    name: string,
    ctx: ProviderExecutionContext,
    work: (span: DiagnosticSpan) => Promise<AgentToolOutcome>,
  ) {
    return this.measure(
      'tool',
      {
        tool: name,
        conversationId: ctx.conversationId,
        runId: ctx.runId,
        turnId: ctx.turnId,
      },
      async (span) => {
        const result = await work(span)
        span.finish(result.status, {
          retryable: result.retry?.allowed,
          aborted: ctx.signal?.aborted,
          mutation: result.mutation,
          mutationScope: result.mutationScope,
        })
        return result
      },
    )
  }
  private readonly events: Event[] = []
  private readonly discoveryEvents: Event[] = []
  private importantDropped = 0
  private discoveryDropped = 0
  private readonly identities = new Map<string, string>()
  private readonly exposure = new ExposureDiagnosticBuffer((field, value) =>
    this.identities.get(`${field}:${value}`),
  )
  private identity = 0
  private sequence = 0
  private spans = 0
  private readonly session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  onChange?: () => void

  recordExposure(fact: ExposureSubmissionFact): void {
    try {
      this.exposure.record(fact)
      this.onChange?.()
    } catch {
      /* Diagnostics never changes an operation's outcome. */
    }
  }
  recordWireExposure(fact: ExposureWireFact): void {
    try {
      this.exposure.recordWire(fact)
      this.onChange?.()
    } catch {
      /* Diagnostics never changes an operation's outcome. */
    }
  }

  private fields(input: DiagnosticFields): Event['fields'] {
    const output: Event['fields'] = {}
    for (const [key, value] of Object.entries(input)) {
      if (aliases.has(key) && typeof value === 'string') {
        const id = `${key}:${value}`
        if (!this.identities.has(id)) {
          if (this.identities.size >= 4096)
            this.identities.delete(
              this.identities.keys().next().value as string,
            )
          this.identities.set(id, `ref-${++this.identity}`)
        }
        output[key] = this.identities.get(id) ?? 'unavailable'
      } else if (
        numbers.has(key) &&
        typeof value === 'number' &&
        Number.isFinite(value)
      ) {
        output[key] = Math.round(value * 100) / 100
      } else if (booleans.has(key) && typeof value === 'boolean')
        output[key] = value
      else if (
        Object.prototype.hasOwnProperty.call(states, key) &&
        typeof value === 'string'
      )
        output[key] = states[key].includes(value) ? value : 'OTHER'
      else if (key === 'errorCode' && typeof value === 'string')
        output[key] = errorCodes.has(value) ? value : 'OTHER'
      else if (
        ['providerId', 'tool'].includes(key) &&
        typeof value === 'string'
      ) {
        output[key] = /^[a-zA-Z0-9_.:-]{1,100}$/.test(value)
          ? value
          : 'redacted'
      }
    }
    return output
  }

  begin(
    operation: DiagnosticOperation,
    fields: DiagnosticFields = {},
  ): DiagnosticSpan {
    const span = ++this.spans
    const start = now()
    let ended = false
    const context = this.fields(fields)
    const mark = (stage: DiagnosticStage, details: DiagnosticFields = {}) => {
      try {
        const discovery = operation === 'discovery' && stage !== 'failed'
        const buffer = discovery ? this.discoveryEvents : this.events
        buffer.push({
          seq: ++this.sequence,
          at: new Date().toISOString(),
          elapsedMs: Math.round((now() - start) * 100) / 100,
          span,
          operation,
          stage,
          fields: { ...context, ...this.fields(details) },
        })
        if (buffer.length > (discovery ? 200 : 800)) {
          buffer.shift()
          if (discovery) this.discoveryDropped++
          else this.importantDropped++
        }
        this.onChange?.()
      } catch {
        /* Diagnostics never changes an operation's outcome. */
      }
    }
    mark('start')
    return {
      mark,
      finish: (stage, details) => {
        if (ended) return
        ended = true
        mark(stage, { ...details, durationMs: now() - start })
      },
    }
  }

  async measure<T>(
    operation: DiagnosticOperation,
    fields: DiagnosticFields,
    work: (span: DiagnosticSpan) => Promise<T>,
  ): Promise<T> {
    const span = this.begin(operation, fields)
    try {
      const result = await work(span)
      span.finish('succeeded')
      return result
    } catch (error) {
      span.finish('failed')
      throw error
    }
  }

  snapshot() {
    const base = {
      schemaVersion: 1,
      session: this.session,
      build: VERBEX_BUILD_INFO,
      dropped: this.importantDropped + this.discoveryDropped,
      retention: {
        importantLimit: 800,
        discoveryLimit: 200,
        importantDropped: this.importantDropped,
        discoveryDropped: this.discoveryDropped,
      },
      aliasEvictions: Math.max(0, this.identity - 4096),
      events: [...this.events, ...this.discoveryEvents]
        .sort((a, b) => a.seq - b.seq)
        .map((event) => ({
          ...event,
          fields: { ...event.fields },
        })),
    }
    const baseBytes = diagnosticJsonBytes(base)
    const budget = Math.max(0, 1024 * 1024 - 1024 - baseBytes)
    return { ...base, exposure: this.exposure.snapshot(budget) }
  }
}
