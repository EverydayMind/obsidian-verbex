import { Settings, Trash2 } from 'lucide-react'
import { App } from 'obsidian'
import { ObsidianToggle } from 'src/components/common/ObsidianToggle'

import { useSettings } from '../../../../contexts/settings-context'
import { cleanupChatModelReferences } from '../../../../core/llm/modelReadiness'
import { chatModelSupportsTools } from '../../../../core/llm/toolSupport'
import { t } from '../../../../i18n'
import VerbexPlugin from '../../../../main'
import { ConfirmModal } from '../../../modals/ConfirmModal'
import { AddChatModelModal } from '../../modals/AddChatModelModal'

import {
  ChatModelSettingsModal,
  hasChatModelSettings,
} from './ChatModelSettings'

type ChatModelsSubSectionProps = {
  app: App
  plugin: VerbexPlugin
}

const isEnabled = (enable: boolean | undefined | null) => enable ?? true

export function ChatModelsSubSection({
  app,
  plugin,
}: ChatModelsSubSectionProps) {
  const { settings, setSettings } = useSettings()

  // §8-1/P1-8: deleting the currently selected model is allowed — the empty/
  // stale-selection state is now a well-handled fact (first-run banners,
  // submit pre-flight), not something the settings UI needs to block. When
  // the deleted model was selected, chatModelId/applyModelId/modelAliases are
  // cleared to '' in the same settings write so no stale id survives.
  const handleDeleteChatModel = async (modelId: string) => {
    const message = t('settings.chatModels.deleteConfirm.message', {
      id: modelId,
    })
    new ConfirmModal(app, {
      title: t('settings.chatModels.deleteConfirm.title'),
      message: message,
      ctaText: t('settings.common.delete'),
      onConfirm: () => {
        void (async () => {
          const cleaned = cleanupChatModelReferences(
            settings,
            new Set([modelId]),
          )
          await setSettings({
            ...settings,
            ...cleaned,
            chatModels: settings.chatModels.filter((v) => v.id !== modelId),
          })
        })()
      },
    }).open()
  }

  // Disabling the selected model is allowed too (and reversible, unlike
  // delete): the id is left as-is so re-enabling restores the prior
  // selection without the user having to re-pick it. checkChatModelReadiness
  // already reports a disabled-but-still-referenced model as `disabled`, so
  // the readiness gate catches it without any reference cleanup here.
  const handleToggleEnableChatModel = async (
    modelId: string,
    value: boolean,
  ) => {
    await setSettings({
      ...settings,
      chatModels: [...settings.chatModels].map((v) =>
        v.id === modelId ? { ...v, enable: value } : v,
      ),
    })
  }

  return (
    <div>
      <div className="verbex-settings-desc">
        {t('settings.chatModels.desc')}
      </div>

      <div className="verbex-settings-table-container">
        <table className="verbex-settings-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col width={80} />
            <col width={60} />
            <col width={60} />
          </colgroup>
          <thead>
            <tr>
              <th>{t('settings.chatModels.table.id')}</th>
              <th>{t('settings.chatModels.table.providerId')}</th>
              <th>{t('settings.chatModels.table.model')}</th>
              <th>{t('settings.chatModels.table.tools')}</th>
              <th>{t('settings.chatModels.table.enable')}</th>
              <th>{t('settings.chatModels.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {settings.chatModels.map((chatModel) => (
              <tr key={chatModel.id}>
                <td>{chatModel.id}</td>
                <td>{chatModel.providerId}</td>
                <td>{chatModel.model}</td>
                <td>
                  {chatModelSupportsTools({ settings, model: chatModel })
                    ? t('settings.common.on')
                    : t('settings.common.off')}
                </td>
                <td>
                  <ObsidianToggle
                    value={isEnabled(chatModel.enable)}
                    onChange={(value) => {
                      void handleToggleEnableChatModel(chatModel.id, value)
                    }}
                  />
                </td>
                <td>
                  <div className="verbex-settings-actions">
                    {hasChatModelSettings(chatModel) && (
                      <button
                        onClick={() => {
                          new ChatModelSettingsModal(
                            chatModel,
                            app,
                            plugin,
                          ).open()
                        }}
                        className="clickable-icon"
                      >
                        <Settings />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        void handleDeleteChatModel(chatModel.id)
                      }}
                      className="clickable-icon"
                    >
                      <Trash2 />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>
                <button
                  onClick={() => {
                    new AddChatModelModal(app, plugin).open()
                  }}
                >
                  {t('settings.chatModels.addCustom')}
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
