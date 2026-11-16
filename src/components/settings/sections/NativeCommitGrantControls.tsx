import { useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { t } from '../../../i18n'
import type VerbexPlugin from '../../../main'
import { SCOPED_COMMIT_RELEASED } from '../../../provider/interop/commitPolicy'
import type { NativeProviderStatus } from '../../../provider/interop/NativeProviderHost'

export function NativeCommitGrantControls({
  plugin,
  status,
}: {
  plugin: VerbexPlugin
  status: NativeProviderStatus
}) {
  const { settings, setSettings } = useSettings()
  const [error, setError] = useState('')
  const grants = settings.nativeProviders.commitGrants
  const grant = grants.find((item) => item.providerId === status.providerId)
  const currentGrant =
    grant?.descriptorDigest === status.digest ? grant : undefined
  const tools =
    status.descriptor?.tools.filter((tool) => tool.effect === 'commit') ?? []
  if (!tools.length) return null
  const update = async (name: string, enabled: boolean) => {
    if (!SCOPED_COMMIT_RELEASED) return
    try {
      await plugin.nativeProviderHost.refresh()
      const current = plugin.nativeProviderHost
        .getStatuses()
        .find((item) => item.providerId === status.providerId)
      if (
        current?.state !== 'active' ||
        !status.digest ||
        current.digest !== status.digest ||
        !plugin.nativeProviderHost
          .hostContext()
          .isCurrent(status.providerId, name)
      )
        throw new Error(
          t(
            'ui.NativeCommitGrantControls.toolDefinitionsOrApprovalChangedCheckAgain',
          ),
        )
      const names = new Set(currentGrant?.toolNames ?? [])
      if (enabled) names.add(name)
      else names.delete(name)
      const next = grants.filter(
        (item) => item.providerId !== status.providerId,
      )
      if (names.size)
        next.push({
          providerId: status.providerId,
          descriptorDigest: status.digest,
          toolNames: [...names],
        })
      await setSettings({
        ...settings,
        nativeProviders: { ...settings.nativeProviders, commitGrants: next },
      })
      setError('')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('ui.NativeCommitGrantControls.couldNotUpdateSaveToolPermission'),
      )
    }
  }
  return (
    <fieldset>
      <legend>{t('ui.NativeCommitGrantControls.allowVaultSaveTools')}</legend>
      <p>
        {t(
          'ui.NativeCommitGrantControls.separateFromToolDefinitionApprovalEachSave',
        )}
      </p>
      {!SCOPED_COMMIT_RELEASED && (
        <p>
          {t('ui.NativeCommitGrantControls.saveToolPermissionIsDisabledInThis')}
        </p>
      )}
      {grant && !currentGrant && (
        <p>
          {t(
            'ui.NativeCommitGrantControls.theDefinitionChangedAndThePreviousSave',
          )}
        </p>
      )}
      {tools.map((tool) => (
        <label key={tool.name}>
          <input
            type="checkbox"
            disabled={!SCOPED_COMMIT_RELEASED || status.state !== 'active'}
            checked={currentGrant?.toolNames.includes(tool.name) ?? false}
            onChange={(event) => void update(tool.name, event.target.checked)}
          />{' '}
          {tool.name}
        </label>
      ))}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  )
}
