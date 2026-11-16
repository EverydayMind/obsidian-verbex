import { t } from '../../i18n'
import type { NativeProviderHost } from '../../provider/interop/NativeProviderHost'
import type { SessionGrant } from '../../provider/interop/sessionGrants'

export function revokeSessionGrant(
  host: NativeProviderHost,
  grant: SessionGrant,
  setNotice: (notice: string) => void,
) {
  // Revocation is synchronous before the first await; a pending model call cannot use the old grant.
  const cleanup = host.revokeGrant(grant)
  setNotice(t('ui.SessionGrants.editingApprovalRevokedAppliedChangesRemainIn'))
  void cleanup.catch(() =>
    setNotice(
      t('ui.SessionGrants.editingApprovalRevokedDocumentDisconnectionCouldNot'),
    ),
  )
}
