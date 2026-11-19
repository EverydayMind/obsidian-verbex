import type { App } from 'obsidian'
import { useEffect, useState } from 'react'

import { useSettings } from '../../contexts/settings-context'
import {
  checkChatModelReadiness,
  isExecutionReady,
} from '../../core/llm/modelReadiness'
import {
  firstReadyProvider,
  providerDiscoveryReadiness,
} from '../../core/llm/providerDiscoveryReadiness'
import { t } from '../../i18n'
import type VerbexPlugin from '../../main'
import type { NativeProviderStatus } from '../../provider/interop/hostScanTypes'

import { AddChatModelModal } from './modals/AddChatModelModal'
import {
  openAddProviderModal,
  openEditProviderModal,
} from './modals/providerModalOpeners'
import { providerSetupLabel } from './modals/providerSetupLabel'
import { disabledCommitToolNoticeCount } from './sections/NativeDisabledSaveToolNotice'

type SettingsReadinessProps = {
  app: App
  plugin: VerbexPlugin
  /** Switches the settings screen to the Tool management tab. */
  onShowToolManagement: () => void
}

type ReadinessLineProps = {
  id: string
  done: boolean
  text: string
  action?: { label: string; onClick: () => void }
}

function ReadinessLine({ id, done, text, action }: ReadinessLineProps) {
  return (
    <li
      className="verbex-settings-readiness-line"
      data-readiness={id}
      data-state={done ? 'done' : 'needed'}
    >
      <span className="verbex-settings-readiness-mark">
        {done ? t('settings.readiness.done') : t('settings.readiness.needed')}
      </span>
      <span className="verbex-settings-readiness-text">{text}</span>
      {action && (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </li>
  )
}

// Same source as the chat approval banner: host statuses, refreshed once.
function useNativeProviderStatuses(plugin: VerbexPlugin) {
  const [statuses, setStatuses] = useState<NativeProviderStatus[]>([])
  useEffect(() => {
    let active = true
    const update = () => {
      if (active) setStatuses(plugin.nativeProviderHost.getStatuses())
    }
    const detach = plugin.nativeProviderHost.onStatusesChanged(update)
    void plugin.nativeProviderHost.refresh().then(update).catch(update)
    return () => {
      active = false
      detach()
    }
  }, [plugin])
  return statuses
}

/**
 * The few things a new user must set up, each with its current state. Every
 * state reuses a judgment the rest of the app already makes; none is new.
 */
export function SettingsReadiness({
  app,
  plugin,
  onShowToolManagement,
}: SettingsReadinessProps) {
  const { settings } = useSettings()
  const statuses = useNativeProviderStatuses(plugin)

  const readyProvider = firstReadyProvider(settings.providers)
  const unreadyProvider = settings.providers.find(
    (provider) => providerDiscoveryReadiness(provider) !== 'ready',
  )
  const chatReadiness = checkChatModelReadiness(settings, settings.chatModelId)
  const chatModelReady = isExecutionReady(chatReadiness)
  const chatProviderUnready =
    chatReadiness.status === 'credentials_missing' ||
    chatReadiness.status === 'base_url_missing'
      ? chatReadiness.provider
      : undefined
  const pending = statuses.filter(
    (status) => status.state === 'pending' || status.state === 'reapproval',
  )
  const saveToolsOff = statuses
    .map((status) => ({
      providerId: status.providerId,
      count: disabledCommitToolNoticeCount(
        status,
        settings.nativeProviders.commitGrants,
      ),
    }))
    .filter((item) => item.count > 0)

  const toolApprovalJump = (providerId: string) => ({
    label: t('settings.readiness.goToToolApproval'),
    onClick: () => {
      onShowToolManagement()
      plugin.requestSettingsFocus({ section: 'tool-approval', providerId })
    },
  })

  return (
    <div className="verbex-settings-section verbex-settings-readiness">
      <h2 className="verbex-settings-header">
        {t('settings.readiness.title')}
      </h2>
      <ul>
        {readyProvider ? (
          <ReadinessLine
            id="provider"
            done
            text={t('settings.readiness.providerReady', {
              id: readyProvider.id,
            })}
          />
        ) : (
          <ReadinessLine
            id="provider"
            done={false}
            text={t('settings.readiness.providerNeeded')}
            action={{
              label: unreadyProvider
                ? providerSetupLabel(unreadyProvider)
                : t('settings.chatModels.discovery.addProvider'),
              onClick: () => {
                if (unreadyProvider)
                  openEditProviderModal(app, plugin, unreadyProvider)
                else openAddProviderModal(app, plugin)
              },
            }}
          />
        )}
        {chatModelReady ? (
          <ReadinessLine
            id="chat-model"
            done
            text={t('settings.readiness.chatModelReady', {
              id: settings.chatModelId,
            })}
          />
        ) : chatProviderUnready ? (
          <ReadinessLine
            id="chat-model"
            done={false}
            text={t('settings.readiness.chatModelProviderNeeded', {
              id: settings.chatModelId,
              providerId: chatProviderUnready.id,
            })}
            action={{
              label: providerSetupLabel(chatProviderUnready),
              onClick: () =>
                openEditProviderModal(app, plugin, chatProviderUnready),
            }}
          />
        ) : (
          <ReadinessLine
            id="chat-model"
            done={false}
            text={t('settings.readiness.chatModelNeeded')}
            action={{
              label: t('settings.readiness.addChatModel'),
              onClick: () => new AddChatModelModal(app, plugin).open(),
            }}
          />
        )}
        {pending.length > 0 ? (
          <ReadinessLine
            id="approvals"
            done={false}
            text={t('settings.readiness.approvalsPending', {
              count: pending.length,
            })}
            action={toolApprovalJump(pending[0].providerId)}
          />
        ) : (
          <ReadinessLine
            id="approvals"
            done
            text={t('settings.readiness.approvalsNone')}
          />
        )}
        {saveToolsOff.length > 0 && (
          <ReadinessLine
            id="save-tools"
            done={false}
            text={t('settings.readiness.saveToolsOff', {
              count: saveToolsOff.reduce((sum, item) => sum + item.count, 0),
            })}
            action={toolApprovalJump(saveToolsOff[0].providerId)}
          />
        )}
      </ul>
    </div>
  )
}
