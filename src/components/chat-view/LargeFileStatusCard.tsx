import { t } from '../../i18n'
import { LargeFileCardState } from '../../types/chat'
import DotLoader from '../common/DotLoader'

function marker(
  status: 'done' | 'active' | 'pending' | 'failed' | 'cancelled',
): string {
  if (status === 'done') return '✓'
  if (status === 'active') return '●'
  if (status === 'failed') return '✕'
  if (status === 'cancelled') return '−'
  return '○'
}

/**
 * §6.3: one updatable status card for a whole-document analysis or transform.
 * Renders the work-focused checklist instead of the internal per-chunk tool
 * messages, so the transcript stays a single work item rather than a log.
 */
export default function LargeFileStatusCard({
  card,
}: {
  card: LargeFileCardState
}) {
  const fileName = card.path.split('/').pop() ?? card.path
  const outcome = card.outcome ?? (card.done ? 'completed' : 'running')
  const titleSuffix =
    outcome === 'completed'
      ? t('ui.LargeFileStatusCard.completed')
      : outcome === 'failed'
        ? t('ui.LargeFileStatusCard.failed')
        : outcome === 'cancelled'
          ? t('ui.LargeFileStatusCard.cancelled')
          : t('ui.LargeFileStatusCard.inProgress')
  return (
    <div className="verbex-large-file-card">
      <div className="verbex-large-file-card-title">
        <span>
          {`${card.title} ${titleSuffix}`}
          {' · '}
          {fileName}
        </span>
        {!card.done && <DotLoader />}
      </div>
      <ul className="verbex-large-file-card-steps">
        {card.steps.map((step) => (
          <li
            key={step.key}
            className={`verbex-large-file-card-step verbex-large-file-card-step-${step.status}`}
          >
            <span className="verbex-large-file-card-step-marker">
              {marker(step.status)}
            </span>
            <span className="verbex-large-file-card-step-label">
              {step.label}
              {step.detail ? ` (${step.detail})` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
