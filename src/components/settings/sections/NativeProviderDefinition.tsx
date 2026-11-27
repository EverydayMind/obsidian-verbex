import type { ReactNode } from 'react'

import { t } from '../../../i18n'
import type { NativeProviderStatus } from '../../../provider/interop/hostScanTypes'

import { NativeEffectSummary } from './NativeEffectSummary'
import { NativeRawDescriptor } from './NativeReapprovalReview'
import type { ReadSkillBody } from './NativeSkillBodyView'
import { NativeSkillSummary } from './NativeSkillSummary'
import { NativeToolSummary } from './NativeToolSummary'

export function NativeProviderDefinition({
  status,
  toolControls,
  readSkillBody,
}: {
  status: NativeProviderStatus
  toolControls?: (name: string) => ReactNode
  readSkillBody?: ReadSkillBody
}) {
  const descriptor = status.descriptor
  if (!descriptor) return null
  return (
    <div className="verbex-native-provider-definition">
      <NativeEffectSummary tools={descriptor.tools} />
      <NativeSkillSummary status={status} readBody={readSkillBody} />
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
          <NativeToolSummary status={status} tool={tool} />
          <p>{tool.description}</p>
          <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
          {toolControls?.(tool.name)}
        </details>
      ))}
    </div>
  )
}
