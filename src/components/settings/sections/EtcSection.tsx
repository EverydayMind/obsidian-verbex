import { App, Notice } from 'obsidian'

import { useSettings } from '../../../contexts/settings-context'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { verbexSettingsSchema } from '../../../settings/schema/setting.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ConfirmModal } from '../../modals/ConfirmModal'

type EtcSectionProps = {
  app: App
  plugin: VerbexPlugin
}

export function EtcSection({ app, plugin: _plugin }: EtcSectionProps) {
  const { settings, setSettings } = useSettings()

  const setAuditLogging = async (auditLogging: boolean) => {
    await setSettings({
      ...settings,
      verbex: {
        ...settings.verbex,
        privacy: { ...settings.verbex.privacy, auditLogging },
      },
    })
  }

  const handleResetSettings = () => {
    new ConfirmModal(app, {
      title: t('settings.etc.resetSettings.confirm.title'),
      message: t('settings.etc.resetSettings.confirm.message'),
      ctaText: t('settings.etc.resetSettings.confirm.ctaText'),
      onConfirm: () => {
        void (async () => {
          const defaultSettings = verbexSettingsSchema.parse({})
          await setSettings(defaultSettings)
          new Notice(t('settings.etc.resetSettings.confirm.notice'))
        })()
      },
    }).open()
  }

  return (
    <div className="verbex-settings-section">
      <h2 className="verbex-settings-header">{t('settings.etc.title')}</h2>

      <ObsidianSetting
        name={t('settings.etc.debugMode.name')}
        desc={t('settings.etc.debugMode.desc')}
      >
        <ObsidianToggle
          value={settings.verbex.debug.mode}
          onChange={(mode) => {
            void setSettings({
              ...settings,
              verbex: {
                ...settings.verbex,
                debug: { ...settings.verbex.debug, mode },
              },
            })
          }}
        />
      </ObsidianSetting>
      <div style={{ marginLeft: '24px' }}>
        <ObsidianSetting
          name={t('settings.etc.storeRunBodies.name')}
          desc={t('settings.etc.storeRunBodies.desc')}
        >
          <ObsidianToggle
            value={settings.verbex.debug.storeRunBodies}
            disabled={!settings.verbex.debug.mode}
            onChange={(storeRunBodies) => {
              void setSettings({
                ...settings,
                verbex: {
                  ...settings.verbex,
                  debug: { ...settings.verbex.debug, storeRunBodies },
                },
              })
            }}
          />
        </ObsidianSetting>
      </div>

      <ObsidianSetting
        name={t('settings.etc.auditLogging.name')}
        desc={t('settings.etc.auditLogging.desc')}
      >
        <ObsidianToggle
          value={settings.verbex.privacy.auditLogging}
          onChange={(...args) => {
            void setAuditLogging(...args)
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.etc.resetSettings.name')}
        desc={t('settings.etc.resetSettings.desc')}
      >
        <ObsidianButton
          text={t('settings.etc.resetSettings.button')}
          warning
          onClick={handleResetSettings}
        />
      </ObsidianSetting>
    </div>
  )
}
