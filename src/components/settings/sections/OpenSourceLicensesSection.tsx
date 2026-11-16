import { t } from '../../../i18n'
import { THIRD_PARTY_LICENSES } from '../../../licenses'

export function OpenSourceLicensesSection() {
  return (
    <div className="verbex-settings-section">
      <div className="verbex-settings-header">
        {t('settings.openSourceLicenses.title')}
      </div>
      <p className="verbex-settings-description">
        {t('settings.openSourceLicenses.desc')}
      </p>
      <div className="verbex-open-source-licenses">
        {THIRD_PARTY_LICENSES.map((license) => (
          <details key={license.name} className="verbex-open-source-license">
            <summary>
              <span>{license.name}</span>
              <span className="verbex-open-source-license-type">
                MIT License
              </span>
            </summary>
            <div className="verbex-open-source-license-body">
              <p>{license.copyright}</p>
              <p>
                {t('settings.openSourceLicenses.source')}{' '}
                <a href={license.sourceUrl} target="_blank" rel="noreferrer">
                  {license.sourceUrl}
                </a>
              </p>
              <pre>{license.licenseText}</pre>
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
