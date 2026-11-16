import { AuditTurnRecord } from '../../types/chat'

type AuditTracePanelProps = {
  auditLog: AuditTurnRecord[]
}

export function AuditTracePanel({ auditLog }: AuditTracePanelProps) {
  if (auditLog.length === 0) return null

  return (
    <details className="verbex-audit-panel">
      <summary>Context audit ({auditLog.length} turns)</summary>
      <div className="verbex-audit-panel-body">
        {auditLog.map((turn) => (
          <section className="verbex-audit-turn" key={turn.turnId}>
            <div className="verbex-audit-turn-heading">
              <span>Turn {turn.turnId.slice(0, 8)}</span>
              <span>{turn.events.length} aggregate events</span>
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
