import { App } from 'obsidian'
import { useEffect, useState } from 'react'

import { t } from '../../i18n'
import VerbexPlugin from '../../main'

import {
  AdvancedPanel,
  ChatPanel,
  GetStartedPanel,
  SearchPanel,
  ToolManagementPanel,
} from './SettingsTabPanels'
import { SettingsTabs } from './SettingsTabs'

type SettingsTabRootProps = {
  app: App
  plugin: VerbexPlugin
}

type SettingsTabId =
  | 'getStarted'
  | 'toolManagement'
  | 'chat'
  | 'search'
  | 'advanced'

// The tab last viewed in this app session. Deliberately not persisted.
let lastViewedTab: SettingsTabId | undefined

/** Test hook: forget the tab remembered from an earlier render. */
export function resetLastViewedSettingsTab(): void {
  lastViewedTab = undefined
}

export function SettingsTabRoot({ app, plugin }: SettingsTabRootProps) {
  // A pending "Review" jump (chat approval banner) targets Tool approval, which
  // lives on the Tool management tab; NativeProviderSection consumes it there.
  const [selected, setSelected] = useState<SettingsTabId>(() =>
    plugin.peekSettingsFocus?.()
      ? 'toolManagement'
      : (lastViewedTab ?? 'getStarted'),
  )
  useEffect(() => {
    lastViewedTab = selected
  }, [selected])
  useEffect(
    () => plugin.onSettingsFocus?.(() => setSelected('toolManagement')),
    [plugin],
  )

  // The Tool management label is the wording the model is told to point at
  // ("Verbex settings › Tool management"), so it reuses the section's own key.
  const tabs: { id: SettingsTabId; label: string }[] = [
    { id: 'getStarted', label: t('settings.tabs.getStarted') },
    {
      id: 'toolManagement',
      label: t('ui.ToolManagementSection.toolManagement'),
    },
    { id: 'chat', label: t('settings.tabs.chat') },
    { id: 'search', label: t('settings.tabs.search') },
    { id: 'advanced', label: t('settings.tabs.advanced') },
  ]

  return (
    <SettingsTabs<SettingsTabId>
      tabs={tabs}
      selected={selected}
      onSelect={setSelected}
      ariaLabel={t('settings.tabs.ariaLabel')}
    >
      {selected === 'getStarted' && (
        <GetStartedPanel
          app={app}
          plugin={plugin}
          onShowToolManagement={() => setSelected('toolManagement')}
        />
      )}
      {selected === 'toolManagement' && (
        <ToolManagementPanel app={app} plugin={plugin} />
      )}
      {selected === 'chat' && <ChatPanel app={app} plugin={plugin} />}
      {selected === 'search' && <SearchPanel app={app} plugin={plugin} />}
      {selected === 'advanced' && <AdvancedPanel app={app} plugin={plugin} />}
    </SettingsTabs>
  )
}
