import type { TurnRecord } from '../runstate/turnLedger'
import type { AuditEvent } from '../types/chat'

export function emitTurnFacts(
  enabled: boolean,
  record: TurnRecord,
  notify?: (event: AuditEvent) => void,
): void {
  if (!enabled || !notify) return
  notify({
    timestamp: Date.now(),
    actor: 'system',
    kind: 'turn_facts',
    turnId: record.turnId,
    summary: 'Turn execution facts',
    details: {
      toolCalls: record.toolCalls.length,
      partial: record.toolCalls.filter((c) => c.completeness === 'partial')
        .length,
      unsupported: record.toolCalls.filter(
        (c) => c.completeness === 'unsupported',
      ).length,
      uninspected: record.evidence.discovered.filter(
        (p) => !record.evidence.inspected.includes(p),
      ).length,
      bareContinuation: record.bareContinuation,
    },
  })
}

export function emitToolExposure(
  enabled: boolean,
  record: TurnRecord,
  names: string[],
  excluded: number,
  tokens: number,
  notify?: (event: AuditEvent) => void,
): void {
  record.exposedTools = [...new Set([...record.exposedTools, ...names])]
  if (!enabled || !notify) return
  notify({
    timestamp: Date.now(),
    actor: 'system',
    kind: 'tool_exposure',
    turnId: record.turnId,
    summary: 'Tool exposure counts',
    details: {
      exposed: names.length,
      explicit: record.explicitTools.filter((n) => names.includes(n)).length,
      excluded,
      definitionTokens: tokens,
    },
  })
}
