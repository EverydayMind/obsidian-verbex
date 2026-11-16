import { emitAgentAuditEvent } from './audit/agentRunEvent'
import { t } from './i18n'

export function emitToolWriteAudit(
  onAuditEvent: Parameters<typeof emitAgentAuditEvent>[0],
  runId: string,
  tool: string,
  path: string,
) {
  emitAgentAuditEvent(
    onAuditEvent,
    runId,
    'checkpoint',
    t('runtimeR5.checkpoint'),
    path,
  )
  emitAgentAuditEvent(
    onAuditEvent,
    runId,
    'tool_permission_decision',
    t('runtimeR5.toolPermission', { tool, path }),
    path,
  )
}
