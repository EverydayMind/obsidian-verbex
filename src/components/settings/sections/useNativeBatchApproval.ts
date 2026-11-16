import { t } from '../../../i18n'
import type VerbexPlugin from '../../../main'
import { copyApproval } from '../../../provider/interop/batchApproval'
import type { NativeProviderStatus } from '../../../provider/interop/hostScanTypes'
import type { NativeProviderApproval } from '../../../provider/interop/protocol'
import type { VerbexSettings } from '../../../settings/schema/setting.types'

export async function revokeReviewedApprovals(
  plugin: VerbexPlugin,
  setSettings: (value: VerbexSettings) => void | Promise<void>,
  setError: (value: string) => void,
  providerId: string,
  reviewed: string,
) {
  try {
    const latest = plugin.settings
    const current = latest.nativeProviders.providers.filter(
      (item) => item.providerId === providerId,
    )
    if (JSON.stringify(current) !== reviewed)
      throw new Error(
        t('ui.useNativeBatchApproval.approvalSettingsChangedReviewAgain'),
      )
    await setSettings({
      ...latest,
      nativeProviders: {
        ...latest.nativeProviders,
        providers: latest.nativeProviders.providers.filter(
          (item) => item.providerId !== providerId,
        ),
      },
    })
    setError('')
  } catch (cause) {
    setError(
      cause instanceof Error
        ? cause.message
        : t('ui.useNativeBatchApproval.couldNotRevokeApproval'),
    )
  }
}

async function updateReviewedApproval(
  plugin: VerbexPlugin,
  setSettings: (value: VerbexSettings) => void | Promise<void>,
  setError: (value: string) => void,
  providerId: string,
  reviewed: string,
  change: (approval: NativeProviderApproval) => NativeProviderApproval,
) {
  try {
    const latest = plugin.settings
    const current = latest.nativeProviders.providers.filter(
      (item) => item.providerId === providerId,
    )
    if (current.length !== 1 || JSON.stringify(current) !== reviewed)
      throw new Error(
        t('ui.useNativeBatchApproval.approvalSettingsChangedReviewAgain2'),
      )
    await setSettings({
      ...latest,
      nativeProviders: {
        ...latest.nativeProviders,
        providers: latest.nativeProviders.providers.map((item) =>
          item.providerId === providerId ? change(item) : item,
        ),
      },
    })
    setError('')
  } catch (cause) {
    setError(
      cause instanceof Error
        ? cause.message
        : t('ui.useNativeBatchApproval.couldNotUpdateApprovalSettings'),
    )
  }
}

export function useNativeBatchApproval(
  plugin: VerbexPlugin,
  setSettings: (value: VerbexSettings) => void | Promise<void>,
  setError: (value: string) => void,
) {
  const approveOne = async (
    status: NativeProviderStatus,
    previous: NativeProviderApproval | undefined,
  ) => {
    try {
      setError('')
      const reviewedPrevious = previous ? copyApproval(previous) : undefined
      const providerId = status.providerId
      const digest = status.digest ?? ''
      const artifactSha256 = status.artifactSha256
      const approval = await plugin.nativeProviderHost.approve(
        providerId,
        digest,
        artifactSha256,
      )
      const latest = plugin.settings
      const current = latest.nativeProviders.providers.filter(
        (item) => item.providerId === providerId,
      )
      if (
        current.length !== (reviewedPrevious ? 1 : 0) ||
        JSON.stringify(reviewedPrevious) !== JSON.stringify(current[0])
      )
        throw new Error(
          t('ui.useNativeBatchApproval.approvalSettingsChangedReviewAgain3'),
        )
      await setSettings({
        ...latest,
        nativeProviders: {
          ...latest.nativeProviders,
          providers: [
            ...latest.nativeProviders.providers.filter(
              (item) => item.providerId !== providerId,
            ),
            approval,
          ],
        },
      })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('ui.useNativeBatchApproval.approvalFailed'),
      )
    }
  }
  const revoke = (providerId: string, reviewed: string) =>
    revokeReviewedApprovals(plugin, setSettings, setError, providerId, reviewed)
  const update = (
    providerId: string,
    reviewed: string,
    change: (approval: NativeProviderApproval) => NativeProviderApproval,
  ) =>
    updateReviewedApproval(
      plugin,
      setSettings,
      setError,
      providerId,
      reviewed,
      change,
    )
  return {
    approveOne,
    revoke,
    update,
  }
}
