import type { AuditEvent } from '../types/chat'

export function emitAgentAuditEvent(
  onAuditEvent: ((event: AuditEvent) => void) | undefined,
  runId: string,
  kind: AuditEvent['kind'],
  summary: string,
  refId?: string,
  details?: AuditEvent['details'],
) {
  if (runId.startsWith('chat-'))
    onAuditEvent?.({
      timestamp: Date.now(),
      actor: 'system',
      kind,
      summary,
      refId,
      ...(details ? { details } : {}),
    })
}
