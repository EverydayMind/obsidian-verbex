import type { AgentLoopResult } from '../core/llm/agentLoop'
import { t } from '../i18n'
import type { AuditEvent } from '../types/chat'

export function emitAgentCompletion(
  input: { runId: string; onAuditEvent?: (event: AuditEvent) => void },
  result: AgentLoopResult,
): void {
  if (!input.runId.startsWith('chat-') || !input.onAuditEvent) return
  const emit = (
    kind: AuditEvent['kind'],
    summary: string,
    details?: AuditEvent['details'],
  ) =>
    input.onAuditEvent!({
      timestamp: Date.now(),
      actor: 'system',
      kind,
      summary,
      ...(details ? { details } : {}),
    })
  if (result.validationOverridden)
    emit(
      'validation_override_accepted',
      t('ui.agentCompletion.validationFailureAcceptedAsIsByThe'),
    )
  emit(
    'retry',
    t('ui.agentCompletion.agentRunComplete', {
      p0: result.iterations
        ? t('ui.agentCompletion.attempts', { p0: result.iterations })
        : t('ui.agentCompletion.1Attempt'),
    }),
  )
  emit('context_retrieval', 'Agent usage aggregate', {
    completionCalls: result.usage?.completion_calls ?? 0,
    promptTokens: result.usage?.prompt_tokens ?? 0,
    completionTokens: result.usage?.completion_tokens ?? 0,
    totalTokens: result.usage?.total_tokens ?? 0,
    usageEstimated: result.usage?.estimated ?? true,
  })
}
