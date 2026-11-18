import { t } from '../../../i18n'
import { SCOPED_COMMIT_RELEASED } from '../../../provider/interop/commitPolicy'
import type { NativeProviderStatus } from '../../../provider/interop/hostScanTypes'
import type { CommitGrant } from '../../../provider/interop/providerSettingsSchema'

export function disabledCommitToolNoticeCount(
  status: NativeProviderStatus,
  commitGrants: readonly CommitGrant[],
): number {
  if (!SCOPED_COMMIT_RELEASED || status.state !== 'active') return 0
  const commitTools =
    status.descriptor?.tools.filter((tool) => tool.effect === 'commit') ?? []
  if (commitTools.length === 0) return 0
  const grant = commitGrants.find(
    (item) => item.providerId === status.providerId,
  )
  const currentGrant =
    status.digest && grant?.descriptorDigest === status.digest
      ? grant
      : undefined
  const allowedCount = commitTools.filter((tool) =>
    currentGrant?.toolNames.includes(tool.name),
  ).length
  return allowedCount === 0 ? commitTools.length : 0
}

export function NativeDisabledSaveToolNotice({
  status,
  commitGrants,
}: {
  status: NativeProviderStatus
  commitGrants: readonly CommitGrant[]
}) {
  const count = disabledCommitToolNoticeCount(status, commitGrants)
  if (count === 0) return null
  return (
    <p className="mod-warning">
      {t('ui.NativeProviderSection.saveToolsOffNotice', { count })}
    </p>
  )
}
