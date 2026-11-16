import { t } from '../../i18n'
import { ProposedChange } from '../../verbex/types'

const OP_LABEL: Record<string, string> = {
  create: t('ui.ChangeApprovalNotes.create'),
  modify: t('ui.ChangeApprovalNotes.modify'),
  delete: t('ui.ChangeApprovalNotes.delete'),
  rename: t('ui.ChangeApprovalNotes.rename'),
  move: t('ui.ChangeApprovalNotes.move'),
}

/**
 * Approval facts beside the Diff: notes the tool attached and, for a composite
 * change, every other file the one approval covers.
 */
export function ChangeApprovalNotes({ change }: { change: ProposedChange }) {
  const others = (change.composite?.entries ?? []).filter(
    (entry) => entry.path !== change.path,
  )
  if (!change.approvalNotes?.length && others.length === 0) return null
  return (
    <div className="verbex-diff-notes">
      {change.approvalNotes?.length ? (
        <ul>
          {change.approvalNotes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      ) : null}
      {others.length > 0 && (
        <details className="verbex-diff-composite">
          <summary>
            {t('ui.ChangeApprovalNotes.filesChangedByThisApproval')}
            {others.length}
            {t('ui.ChangeApprovalNotes.fileS')}
          </summary>
          <ul>
            {others.map((entry) => (
              <li key={`${entry.op}:${entry.path}`}>
                <span className="verbex-diff-kind">
                  {OP_LABEL[entry.op] ?? entry.op}
                </span>{' '}
                <span className="verbex-diff-path">{entry.path}</span>
                {entry.after === undefined ? (
                  <span>
                    {' '}
                    {t('ui.ChangeApprovalNotes.obsidianUpdatesLinks')}
                  </span>
                ) : entry.after === null ? null : (
                  <details>
                    <summary>{t('ui.ChangeApprovalNotes.viewResult')}</summary>
                    <pre>{entry.after}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
