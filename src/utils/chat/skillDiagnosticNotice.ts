import { t } from '../../i18n'
import { SkillLoadDiagnostic } from '../../skills/SkillLoader'

export function createSkillDiagnosticNotifier(
  seen: Set<string>,
  notify: (message: string) => void,
): (diagnostic: SkillLoadDiagnostic) => void {
  return (diagnostic) => {
    const key = `${diagnostic.path}:${diagnostic.stage}:${diagnostic.message}`
    if (seen.has(key)) return
    seen.add(key)
    notify(
      t('ui.skillDiagnosticNotice.couldNotLoadSkills', { p0: diagnostic.path }),
    )
  }
}
