import { useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { t } from '../../../i18n'
import type VerbexPlugin from '../../../main'
import type { NativeProviderApproval } from '../../../provider/interop/protocol'
import { providerArtifactDigest } from '../../../provider/interop/providerArtifact'

export function NativeArtifactControls({
  plugin,
  approval,
  active,
}: {
  plugin: VerbexPlugin
  approval: NativeProviderApproval
  active: boolean
}) {
  const { setSettings } = useSettings()
  const [preview, setPreview] = useState<{
    digest: string
    previous: string
    providerId: string
  }>()
  const [error, setError] = useState('')
  const prepare = async () => {
    try {
      setError('')
      const providerId = approval.providerId
      const previous = JSON.stringify(approval)
      const digest = await providerArtifactDigest(plugin.app, providerId)
      setPreview({ digest, previous, providerId })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('ui.NativeArtifactControls.couldNotVerifyExecutable'),
      )
    }
  }
  const pin = async () => {
    if (!preview) return
    try {
      const digest = await providerArtifactDigest(
        plugin.app,
        preview.providerId,
      )
      const latest = plugin.settings
      const current = latest.nativeProviders.providers.filter(
        (item) => item.providerId === preview.providerId,
      )
      if (
        digest !== preview.digest ||
        approval.providerId !== preview.providerId ||
        current.length !== 1 ||
        JSON.stringify(current[0]) !== preview.previous
      )
        throw new Error(
          t(
            'ui.NativeArtifactControls.fileOrApprovalSettingsChangedCheckAgain',
          ),
        )
      await setSettings({
        ...latest,
        nativeProviders: {
          ...latest.nativeProviders,
          providers: latest.nativeProviders.providers.map((item) =>
            item.providerId === preview.providerId
              ? { ...item, approvedArtifactSha256: digest }
              : item,
          ),
        },
      })
      setPreview(undefined)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('ui.NativeArtifactControls.couldNotPinExecutable'),
      )
    }
  }
  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {approval.approvedArtifactSha256 ? (
        <p>
          {t('ui.NativeArtifactControls.pinnedFileSHA256')}
          {approval.approvedArtifactSha256}
        </p>
      ) : (
        active && (
          <button onClick={() => void prepare()}>
            {t('ui.NativeArtifactControls.checkExecutableHash')}
          </button>
        )
      )}
      {preview && !approval.approvedArtifactSha256 && (
        <div>
          <p>
            {t('ui.NativeArtifactControls.currentFileSHA256')}
            {preview.digest}
          </p>
          <button onClick={() => void pin()}>
            {t('ui.NativeArtifactControls.pinThisHash')}
          </button>
          <button onClick={() => setPreview(undefined)}>
            {t('ui.NativeArtifactControls.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
