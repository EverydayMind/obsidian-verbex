import { App } from 'obsidian'

import { SettingsProvider } from '../../contexts/settings-context'
import { t } from '../../i18n'
import type VerbexPlugin from '../../main'
import { ReactModal } from '../common/ReactModal'
import { ToolManagementSection } from '../settings/sections/ToolManagementSection'

type Props = { app: App; plugin: VerbexPlugin }
export class ToolManagementModal extends ReactModal<Props> {
  constructor(app: App, plugin: VerbexPlugin) {
    super({
      app,
      Component: Content,
      props: { app, plugin },
      options: { title: t('ui.ToolManagementModal.toolManagement') },
    })
    this.modalEl.addClass('verbex-tool-management-modal')
  }
}
function Content({ app, plugin }: Props) {
  return (
    <SettingsProvider
      settings={plugin.settings}
      setSettings={(settings) => plugin.setSettings(settings)}
      addSettingsChangeListener={(listener) =>
        plugin.addSettingsChangeListener(listener)
      }
    >
      <ToolManagementSection
        app={app}
        plugin={plugin}
        handlesSettingsFocus={false}
      />
    </SettingsProvider>
  )
}
