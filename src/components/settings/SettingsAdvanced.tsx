import React from 'react'

import { t } from '../../i18n'

/** Collapsed block for the rows most people never need to change. */
export function SettingsAdvanced({ children }: { children: React.ReactNode }) {
  return (
    <details className="verbex-settings-advanced">
      <summary>{t('settings.moreSettings')}</summary>
      <div className="verbex-settings-advanced-body">{children}</div>
    </details>
  )
}
