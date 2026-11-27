import { t } from '../../../i18n'
import type { NativeProviderStatus } from '../../../provider/interop/hostScanTypes'

import { EFFECT_LABELS } from './NativeEffectSummary'

/**
 * A tool's `<summary>` line. When its providing plugin reports it unusable right
 * now, a quiet suffix shows the provider's own reason as plain text for people
 * (host-capabilities-v1 section 8); nothing here asks for approval.
 */
export function NativeToolSummary({
  status,
  tool,
}: {
  status: NativeProviderStatus
  tool: { name: string; effect: keyof typeof EFFECT_LABELS }
}) {
  const hidden = status.unavailableTools?.find(
    (item) => item.name === tool.name,
  )
  return (
    <summary>
      {tool.name} · {EFFECT_LABELS[tool.effect]}
      {hidden && (
        <span className="verbex-native-tool-unavailable">
          {' · '}
          {hidden.reason
            ? t('ui.nativeSkills.unavailableNow', { reason: hidden.reason })
            : t('ui.nativeSkills.unavailableNoReason')}
        </span>
      )}
    </summary>
  )
}
