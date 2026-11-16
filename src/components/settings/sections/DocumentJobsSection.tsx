import { useSettings } from '../../../contexts/settings-context'
import { validBaseFontPt } from '../../../core/document-jobs/baseFont'
import { t } from '../../../i18n'
import { ObsidianSetting } from '../../common/ObsidianSetting'

export function DocumentJobsSection() {
  const { settings, setSettings } = useSettings()
  return (
    <div className="verbex-settings-section">
      <div className="verbex-settings-header">
        {t('settings.documentJobs.title')}
      </div>
      <ObsidianSetting
        name={t('settings.documentJobs.baseFontPt')}
        desc={t('settings.documentJobs.description')}
      >
        <input
          type="number"
          min={6}
          max={40}
          step={0.5}
          aria-label={t('settings.documentJobs.baseFontPt')}
          key={settings.documentJobs.baseFontPt}
          defaultValue={settings.documentJobs.baseFontPt}
          onBlur={(event) => {
            const value = event.currentTarget.valueAsNumber
            const baseFontPt = validBaseFontPt(value) ? value : 15
            event.currentTarget.value = String(baseFontPt)
            void setSettings({ ...settings, documentJobs: { baseFontPt } })
          }}
        />
      </ObsidianSetting>
    </div>
  )
}
