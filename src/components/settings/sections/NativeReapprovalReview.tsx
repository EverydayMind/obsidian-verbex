import { t } from '../../../i18n'
import type { NativeProviderStatus } from '../../../provider/interop/NativeProviderHost'
import type { NativeProviderApproval } from '../../../provider/interop/protocol'

export function NativeReapprovalReview({
  status,
  approval,
}: {
  status: NativeProviderStatus
  approval: NativeProviderApproval
}) {
  return (
    <div>
      <p>
        {t('ui.NativeReapprovalReview.approvedPluginVersion')}
        {approval.approvedPluginVersion}{' '}
        {t('ui.NativeReapprovalReview.currentVersion')} {status.pluginVersion}
      </p>
      {approval.approvedArtifactSha256 && (
        <p>
          {t('ui.NativeReapprovalReview.approvedFileSHA256')}
          {approval.approvedArtifactSha256}
          <br />
          {t('ui.NativeReapprovalReview.currentFileSHA256')}
          {status.artifactSha256}
        </p>
      )}
      {status.descriptorDiff ? (
        <details>
          <summary>
            {t(
              'ui.NativeReapprovalReview.itemsChangedFromThePreviousDefinition',
            )}
            {status.descriptorDiff.changes.length}
            {t('ui.NativeReapprovalReview.items')}
          </summary>
          {status.descriptorDiff.changes.map((change) => (
            <div key={change.path}>
              <strong>{change.path}</strong>
              <p>{t('ui.NativeReapprovalReview.previous')}</p>
              <pre>{change.before}</pre>
              <p>{t('ui.NativeReapprovalReview.current')}</p>
              <pre>{change.after}</pre>
            </div>
          ))}
          {status.descriptorDiff.truncated && (
            <p>
              {t(
                'ui.NativeReapprovalReview.someDetailsWereOmittedReviewTheFull',
              )}
            </p>
          )}
        </details>
      ) : (
        <p>
          {t(
            'ui.NativeReapprovalReview.previousApprovedDefinitionsAreMissingOrUnverified',
          )}
        </p>
      )}
    </div>
  )
}

export function NativeRawDescriptor({ json }: { json: string }) {
  return (
    <details>
      <summary>{t('ui.NativeReapprovalReview.fullRawDefinitions')}</summary>
      <pre>{json}</pre>
    </details>
  )
}

export function NativeDuplicateApprovalWarning({ count }: { count: number }) {
  if (count < 2) return null
  return (
    <p className="mod-warning">
      {t('ui.NativeReapprovalReview.approvalRecords')}
      {count}
      {t('ui.NativeReapprovalReview.duplicatesPreventToolUseRevokeAllApproval')}
    </p>
  )
}

export function NativeRevokeApprovalButton({
  duplicate,
  onClick,
}: {
  duplicate: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick}>
      {duplicate
        ? t('ui.NativeReapprovalReview.revokeAllDuplicateApprovals')
        : t('ui.NativeReapprovalReview.revokeApproval')}
    </button>
  )
}
