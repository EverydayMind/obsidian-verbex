import type { App } from 'obsidian'

import { t } from '../../i18n'
import type { BrowserApproval } from '../../provider/interop/browserExecution'
import { pluginLabelWithId } from '../../provider/interop/pluginDisplayName'

/** Argument names that carry what the action sends; anything else stays in the folded details. */
const CONTENT_KEYS = ['url', 'text', 'value', 'query', 'key'] as const
const CONTENT_LIMIT = 300

/** Plain one-line facts from the same data as the raw blocks. A missing field omits its line. */
export function browserApprovalFacts(request: BrowserApproval): string[] {
  const lines: string[] = []
  const origin = request.target.origin
  if (typeof origin === 'string' && origin)
    lines.push(t('ui.BrowserApprovalModal.site', { site: origin }))
  if (request.toolTitle)
    lines.push(
      t('ui.BrowserApprovalModal.action', { action: request.toolTitle }),
    )
  const content = CONTENT_KEYS.flatMap((key) => {
    const value = request.args[key]
    return typeof value === 'string' && value ? [value] : []
  }).join(' · ')
  if (content)
    lines.push(
      t('ui.BrowserApprovalModal.contentBeingSent', {
        content:
          content.length > CONTENT_LIMIT
            ? `${content.slice(0, CONTENT_LIMIT)}…`
            : content,
      }),
    )
  return lines
}

/** Everything above the countdown: who asks, the plain facts, the warning, and the raw data folded. */
export function renderBrowserApprovalBody(
  contentEl: HTMLElement,
  app: App,
  request: BrowserApproval,
): void {
  contentEl.createEl('p', {
    text: `${pluginLabelWithId(app, request.providerName)} · ${request.toolTitle}`,
  })
  for (const text of browserApprovalFacts(request))
    contentEl.createEl('p', { text })
  contentEl.createEl('p', {
    text: t('ui.BrowserApprovalModal.checkTheSiteAndOutgoingContentThis'),
  })
  const details = contentEl.createEl('details')
  details.createEl('summary', { text: t('ui.BrowserApprovalModal.details') })
  const raw: [string, unknown][] = [
    [t('ui.BrowserApprovalModal.actualTargetAndSite'), request.target],
    [t('ui.BrowserApprovalModal.exactActionAndOutgoingContent'), request.args],
    [
      t('ui.BrowserApprovalModal.expectedEffectsPluginDescription'),
      request.card,
    ],
  ]
  for (const [heading, value] of raw) {
    details.createEl('h4', { text: heading })
    details.createEl('pre', { text: JSON.stringify(value, null, 2) })
  }
}
