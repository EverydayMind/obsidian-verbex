import { t } from '../../../i18n'
import type { NativeProviderStatus } from '../../../provider/interop/hostScanTypes'

import type { ReadSkillBody } from './NativeSkillBodyView'
import { NativeSkillRow } from './NativeSkillRow'

/** Skills and document-text extraction a provider declares, for approval review. */
export function NativeSkillSummary({
  status,
  readBody,
}: {
  status: NativeProviderStatus
  readBody?: ReadSkillBody
}) {
  const skills = status.assets?.skills ?? []
  const extensions = status.extractTextExtensions
  if (!status.assets && !extensions) return null
  const skillOnly = status.descriptor?.tools.length === 0 && skills.length > 0
  return (
    <div className="verbex-native-skill-summary">
      {status.assets && (
        <p>
          {t('ui.nativeSkills.skillCount', { count: skills.length })}
          {skillOnly && ` · ${t('ui.nativeSkills.skillOnly')}`}
        </p>
      )}
      {skills.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{t('ui.nativeSkills.colLocale')}</th>
              <th>{t('ui.nativeSkills.colName')}</th>
              <th>{t('ui.nativeSkills.colDescription')}</th>
              <th>{t('ui.nativeSkills.colTokens')}</th>
              <th>{t('ui.nativeSkills.colExposure')}</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <NativeSkillRow
                key={`${skill.id}:${skill.locale}:${status.digest ?? ''}`}
                skill={skill}
                readBody={readBody}
              />
            ))}
          </tbody>
        </table>
      )}
      {extensions && (
        <p>
          {t('ui.nativeSkills.extractLine', {
            extensions: extensions.join(', '),
          })}
        </p>
      )}
    </div>
  )
}
