import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { useApp } from '../../../contexts/app-context'
import { usePlugin } from '../../../contexts/plugin-context'
import { useSettings } from '../../../contexts/settings-context'
import { checkChatModelReadiness } from '../../../core/llm/modelReadiness'
import { t } from '../../../i18n'
import { AddChatModelModal } from '../../settings/modals/AddChatModelModal'
import { openEditProviderModal } from '../../settings/modals/providerModalOpeners'
import { providerSetupLabel } from '../../settings/modals/providerSetupLabel'

export function ModelSelect({
  readOnly = false,
  modelId,
}: {
  readOnly?: boolean
  /** Overrides the displayed model when readOnly (e.g. a past turn's snapshot). */
  modelId?: string
}) {
  const { settings, setSettings } = useSettings()
  const app = useApp()
  const plugin = usePlugin()
  const [isOpen, setIsOpen] = useState(false)
  const usableModels = settings.chatModels.filter(
    ({ enable }) => enable ?? true,
  )

  if (readOnly) {
    const displayId = modelId ?? settings.chatModelId
    return (
      <div className="verbex-chat-input-model-select verbex-chat-input-model-select--readonly">
        <div className="verbex-chat-input-model-select__model-name">
          {displayId || t('settings.chat.modelUnsetOption')}
        </div>
      </div>
    )
  }

  const currentIsUsable = usableModels.some(
    (m) => m.id === settings.chatModelId,
  )
  const triggerLabel = currentIsUsable
    ? settings.chatModelId
    : t('settings.chat.modelUnsetOption')
  const readiness = checkChatModelReadiness(settings, settings.chatModelId)
  const keyProvider =
    readiness.status === 'credentials_missing' ||
    readiness.status === 'base_url_missing'
      ? readiness.provider
      : undefined
  const openAddModelModal = () => {
    setIsOpen(false)
    new AddChatModelModal(app, plugin).open()
  }

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger className="verbex-chat-input-model-select">
        <div className="verbex-chat-input-model-select__model-name">
          {triggerLabel}
        </div>
        <div className="verbex-chat-input-model-select__icon">
          {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </div>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className="verbex-popover">
          <ul>
            {usableModels.map((chatModelOption) => (
              <DropdownMenu.Item
                key={chatModelOption.id}
                onSelect={() => {
                  void setSettings({
                    ...settings,
                    chatModelId: chatModelOption.id,
                  })
                }}
                asChild
              >
                <li>{chatModelOption.id}</li>
              </DropdownMenu.Item>
            ))}
            {keyProvider && (
              <DropdownMenu.Item
                onSelect={() => openEditProviderModal(app, plugin, keyProvider)}
                asChild
              >
                <li>{providerSetupLabel(keyProvider)}</li>
              </DropdownMenu.Item>
            )}
            {!keyProvider && (
              <DropdownMenu.Item onSelect={openAddModelModal} asChild>
                <li>{t('settings.chatModels.addCustom')}</li>
              </DropdownMenu.Item>
            )}
          </ul>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
