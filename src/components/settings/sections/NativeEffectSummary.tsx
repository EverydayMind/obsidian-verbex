import { t } from '../../../i18n'

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
  return (
    <p className="verbex-native-effect-summary">
      {t('ui.NativeProviderDefinition.effectSummary', {
        r: readOnly,
        w: tools.length - readOnly,
      })}
    </p>
  )
}
