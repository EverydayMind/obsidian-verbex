import type { ReactNode } from 'react'

import { t } from '../../../i18n'
import type { NativeProviderStatus } from '../../../provider/interop/hostScanTypes'

import { NativeRawDescriptor } from './NativeReapprovalReview'

const EFFECT_LABELS: Record<string, string> = {
  browser: t('ui.NativeProviderDefinition.browserActionApproveEachCall'),
  read: t('ui.NativeProviderDefinition.read'),
  pure: t('ui.NativeProviderDefinition.calculate'),
  session: t('ui.NativeProviderDefinition.editWorkingCopy'),
  commit: t('ui.NativeProviderDefinition.saveToVaultSeparatePermissionAndPer'),
}
export function NativeProviderDefinition({
  status,
  toolControls,
}: {
  status: NativeProviderStatus
  toolControls?: (name: string) => ReactNode
}) {
  const descriptor = status.descriptor
  if (!descriptor) return null
  return (
    <div className="verbex-native-provider-definition">
      {status.descriptorJson && (
        <NativeRawDescriptor json={status.descriptorJson} />
      )}
      {descriptor.instructions && (
        <>
          <p>
            {t('ui.NativeProviderDefinition.usageSentToTheModelOriginalText')}
          </p>
          <pre>{descriptor.instructions}</pre>
        </>
      )}
      {descriptor.tools.map((tool) => (
        <details key={tool.name}>
          <summary>
            {tool.name} · {EFFECT_LABELS[tool.effect]}
          </summary>
          <p>{tool.description}</p>
          <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
          {toolControls?.(tool.name)}
        </details>
      ))}
    </div>
  )
}
