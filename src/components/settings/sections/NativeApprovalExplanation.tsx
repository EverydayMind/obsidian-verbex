import { t } from '../../../i18n'

/** What approving a plugin's tools does, in three sentences; the technical limits stay folded. */
export function NativeApprovalExplanation() {
  return (
    <>
      <p>
        {t('ui.NativeProviderSection.toolsExposedByEnabledPluginsAvailableTo')}{' '}
        {t('ui.NativeProviderSection.savingNeedsSaveTools')}
      </p>
      <details className="verbex-native-approval-explanation">
        <summary>{t('ui.NativeProviderSection.details')}</summary>
        <p>{t('ui.NativeProviderSection.toolsRunInThePluginsCode')}</p>
        <p>
          {t(
            'ui.NativeProviderSection.optionalExecutableHashesCheckChangesToMain',
          )}
        </p>
        <p>
          {t(
            'ui.NativeProviderSection.openDocumentProtectionUsesDocumentListsFrom',
          )}
        </p>
      </details>
    </>
  )
}
