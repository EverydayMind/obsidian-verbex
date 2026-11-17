import { t } from '../../i18n'
import { AuditTurnRecord } from '../../types/chat'

type AuditTracePanelProps = {
  auditLog: AuditTurnRecord[]
}

export function AuditTracePanel({ auditLog }: AuditTracePanelProps) {
  if (auditLog.length === 0) return null

  return (
    <details className="verbex-audit-panel">
      <summary>
        {t('ui.AuditTracePanel.contextAudit', { p0: auditLog.length })}
      </summary>
      <div className="verbex-audit-panel-body">
        {auditLog.map((turn) => (
          <section className="verbex-audit-turn" key={turn.turnId}>
            <div className="verbex-audit-turn-heading">
              <span>
                {t('ui.AuditTracePanel.turn', { p0: turn.turnId.slice(0, 8) })}
              </span>
              <span>
                {t('ui.AuditTracePanel.events', { p0: turn.events.length })}
              </span>
            </div>
            {turn.events.map((event, index) => (
              <div
                className="verbex-audit-event"
                key={`${event.timestamp}-${index}`}
              >
                <div className="verbex-audit-event-kind">{event.kind}</div>
                <div>{event.summary}</div>
                {event.details && (
                  <div className="verbex-audit-event-details">
                    {Object.entries(event.details).map(([key, value]) => (
                      <span key={key}>
                        {key}: {String(value)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </details>
  )
}
