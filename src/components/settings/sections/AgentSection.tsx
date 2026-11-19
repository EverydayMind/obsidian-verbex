import { App } from 'obsidian'
import { useCallback } from 'react'

import {
  DEFAULT_PROMPTS_FOLDER,
  DEFAULT_SKILLS_FOLDER,
  DEFAULT_WORKFLOWS_FOLDER,
} from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import { t } from '../../../i18n'
import { FolderSuggest } from '../../common/FolderSuggest'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'

type AgentSectionProps = {
  app: App
}

export function AgentSection({ app }: AgentSectionProps) {
  const { settings, setSettings } = useSettings()

  // Stable across renders so ObsidianTextInput attaches the suggester only once.
  const registerFolderSuggest = useCallback(
    (inputEl: HTMLInputElement, onSelect: (value: string) => void) => {
      const suggest = new FolderSuggest(app, inputEl, onSelect)
      return () => suggest.close()
    },
    [app],
  )

  return (
    <div className="verbex-settings-section">
      <h2 className="verbex-settings-header">{t('settings.agent.title')}</h2>

      <ObsidianSetting
        name={t('settings.agent.agentsMdPath.name')}
        desc={t('settings.agent.agentsMdPath.desc')}
      >
        <ObsidianTextInput
          value={settings.agentsMdPath}
          placeholder=".verbex/system-prompt.md"
          onChange={(value) => {
            void setSettings({ ...settings, agentsMdPath: value })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.agent.skillsFolder.name')}
        desc={t('settings.agent.skillsFolder.desc')}
      >
        <ObsidianTextInput
          value={settings.skillsFolder}
          placeholder={DEFAULT_SKILLS_FOLDER}
          registerSuggest={registerFolderSuggest}
          onChange={(value) => {
            void setSettings({ ...settings, skillsFolder: value })
          }}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name={t('settings.agent.workflowsFolder.name')}
        desc={t('settings.agent.workflowsFolder.desc')}
      >
        <ObsidianTextInput
          value={settings.workflowsFolder}
          placeholder={DEFAULT_WORKFLOWS_FOLDER}
          registerSuggest={registerFolderSuggest}
          onChange={(value) => {
            void setSettings({ ...settings, workflowsFolder: value })
          }}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name={t('settings.agent.promptsFolder.name')}
        desc={t('settings.agent.promptsFolder.desc')}
      >
        <ObsidianTextInput
          value={settings.promptsFolder}
          placeholder={DEFAULT_PROMPTS_FOLDER}
          registerSuggest={registerFolderSuggest}
          onChange={(value) => {
            void setSettings({ ...settings, promptsFolder: value })
          }}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name={t('settings.agent.vaultWikiFolder.name')}
        desc={t('settings.agent.vaultWikiFolder.desc')}
      >
        <ObsidianTextInput
          value={settings.vaultWikiFolder}
          placeholder="wiki"
          registerSuggest={registerFolderSuggest}
          onChange={(value) => {
            void setSettings({ ...settings, vaultWikiFolder: value })
          }}
        />
      </ObsidianSetting>
    </div>
  )
}
