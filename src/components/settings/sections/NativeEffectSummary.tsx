import { t } from '../../../i18n'
import { tCount } from '../../../i18n/tCount'

export const EFFECT_LABELS: Record<string, string> = {
  browser: t('ui.NativeProviderDefinition.browserActionApproveEachCall'),
  read: t('ui.NativeProviderDefinition.read'),
  pure: t('ui.NativeProviderDefinition.calculate'),
  session: t('ui.NativeProviderDefinition.editWorkingCopy'),
  commit: t('ui.NativeProviderDefinition.saveToVaultSeparatePermissionAndPer'),
}

/** Display bucket from each tool's declared effect only; read/pure cannot change files. */
export function NativeEffectSummary({
  tools,
}: {
  tools: readonly { effect: string }[]
}) {
  const readOnly = tools.filter(
    (tool) => tool.effect === 'read' || tool.effect === 'pure',
  ).length
  const changing = tools.length - readOnly
  return (
    <p className="verbex-native-effect-summary">
      {tCount(
        readOnly,
        'ui.NativeProviderDefinition.readOnlyToolsOne',
        'ui.NativeProviderDefinition.readOnlyTools',
      )}
      {', '}
      {tCount(
        changing,
        'ui.NativeProviderDefinition.changingToolsOne',
        'ui.NativeProviderDefinition.changingTools',
      )}
    </p>
  )
}
