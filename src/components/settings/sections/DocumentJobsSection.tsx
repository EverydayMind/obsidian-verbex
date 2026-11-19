import { createPortal } from 'react-dom'

import { useSettings } from '../../../contexts/settings-context'
import { validBaseFontPt } from '../../../core/document-jobs/baseFont'
import { t } from '../../../i18n'
import {
  ObsidianSetting,
  useObsidianSetting,
} from '../../common/ObsidianSetting'

/** The number input lives in the row's control area, like other rows. */
function BaseFontInput() {
  const { settings, setSettings } = useSettings()
  const { setting } = useObsidianSetting()
  const input = (
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
  )
  return setting ? createPortal(input, setting.controlEl) : input
}

export function DocumentJobsSection() {
  return (
    <div className="verbex-settings-section">
      <h2 className="verbex-settings-header">
        {t('settings.documentJobs.title')}
      </h2>
      <ObsidianSetting
        name={t('settings.documentJobs.baseFontPt')}
        desc={t('settings.documentJobs.description')}
      >
        <BaseFontInput />
      </ObsidianSetting>
    </div>
  )
}
