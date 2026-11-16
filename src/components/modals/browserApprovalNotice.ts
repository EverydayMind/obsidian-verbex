import { Notice } from 'obsidian'

import { t } from '../../i18n'
export function notifyBrowserApprovalExpired() {
  try {
    new Notice(
      t('ui.BrowserApprovalModal.browserActionApprovalExpiredTheActionWas'),
    )
  } catch {
    /* Notification failure must not keep the approval pending. */
  }
}
