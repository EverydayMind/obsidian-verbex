import type { App } from 'obsidian'

import { t } from '../../../i18n'
import { listPrivacyWarnings } from '../../../security/providerPrivacy'

/** One line under a plugin whose AI-privacy declaration is present but unusable. */
export function NativeProviderPrivacyWarning({
  app,
  providerId,
}: {
  app: App
  providerId: string
}) {
  let invalid = false
  try {
    invalid = listPrivacyWarnings(app).some((item) => item.id === providerId)
  } catch {
    // The warning is advisory; privacy itself never depends on this screen.
  }
  return invalid ? (
    <p className="mod-warning">
      {t('ui.NativeProviderSection.privacyDeclarationInvalid')}
    </p>
  ) : null
}
