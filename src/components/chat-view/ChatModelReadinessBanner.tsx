import type { App } from 'obsidian'

import {
  checkRunModelReadiness,
  formatChatModelReadinessMessage,
  isExecutionReady,
} from '../../core/llm/modelReadiness'
import { chooseReadinessAction } from '../../core/llm/readinessAction'
import { t } from '../../i18n'
import type VerbexPlugin from '../../main'
import type { VerbexSettings } from '../../settings/schema/setting.types'
import { AddChatModelModal } from '../settings/modals/AddChatModelModal'
import {
  openAddProviderModal,
  openEditProviderModal,
} from '../settings/modals/providerModalOpeners'
import { providerSetupLabel } from '../settings/modals/providerSetupLabel'

/** Chat-side notice when the model a run would use cannot be used yet. */
export function ChatModelReadinessBanner({
  app,
  plugin,
  settings,
}: {
  app: App
  plugin: VerbexPlugin
  settings: VerbexSettings
}) {
  const readiness = checkRunModelReadiness(settings, {
    requireTools: settings.chatOptions.enableTools,
  })
  if (isExecutionReady(readiness)) return null
  const action = chooseReadinessAction(settings, readiness)
  const label =
    action.kind === 'setupProvider'
      ? providerSetupLabel(action.provider)
      : action.kind === 'addProvider'
        ? t('settings.chatModels.discovery.addProvider')
        : t('settings.chatModels.addCustom')
  const onClick = () => {
    if (action.kind === 'setupProvider')
      openEditProviderModal(app, plugin, action.provider)
    else if (action.kind === 'addProvider') openAddProviderModal(app, plugin)
    else new AddChatModelModal(app, plugin).open()
  }
  return (
    <div className="verbex-chat-model-readiness-banner">
      <span className="verbex-chat-model-readiness-banner-text">
        {formatChatModelReadinessMessage(readiness)}
      </span>
      <button onClick={onClick}>{label}</button>
    </div>
  )
}
