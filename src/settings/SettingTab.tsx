import { App, PluginSettingTab } from 'obsidian'
import { Root, createRoot } from 'react-dom/client'

import { SettingsTabRoot } from '../components/settings/SettingsTabRoot'
import { SettingsProvider } from '../contexts/settings-context'
import { refreshLocale } from '../i18n'
import VerbexPlugin from '../main'

export class VerbexSettingTab extends PluginSettingTab {
  plugin: VerbexPlugin
  private root: Root | null = null

  constructor(app: App, plugin: VerbexPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    try {
      refreshLocale()
    } catch (e) {
      console.error('[Verbex] Failed to refresh locale on display', e)
    }

    this.root = createRoot(containerEl)
    this.root.render(
      <SettingsProvider
        settings={this.plugin.settings}
        setSettings={(newSettings) => this.plugin.setSettings(newSettings)}
        addSettingsChangeListener={(listener) =>
          this.plugin.addSettingsChangeListener(listener)
        }
      >
        <SettingsTabRoot app={this.app} plugin={this.plugin} />
      </SettingsProvider>,
    )
  }

  hide(): void {
    if (this.root) {
      this.root.unmount()
      this.root = null
    }
  }
}
