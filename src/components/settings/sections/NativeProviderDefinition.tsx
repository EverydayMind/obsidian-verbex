import type { ReactNode } from 'react'

import { t } from '../../../i18n'
import type { NativeProviderStatus } from '../../../provider/interop/hostScanTypes'

import { EFFECT_LABELS, NativeEffectSummary } from './NativeEffectSummary'
import { NativeRawDescriptor } from './NativeReapprovalReview'

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
      <NativeEffectSummary tools={descriptor.tools} />
      {status.descriptorJson && (
        <NativeRawDescriptor json={status.descriptorJson} />
      )}
      {descriptor.instructions && (
        <details>
          <summary>
            {t('ui.NativeProviderDefinition.usageSentToTheModelOriginalText')}
          </summary>
          <pre>{descriptor.instructions}</pre>
        </details>
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
