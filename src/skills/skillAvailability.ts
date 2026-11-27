import { t } from '../i18n'

export function skillAvailability(
  skill: { requiredPlugins?: readonly string[] },
  isPluginEnabled: (id: string) => boolean,
): { available: true } | { available: false; missingPlugins: string[] } {
  const missingPlugins = (skill.requiredPlugins ?? []).filter(
    (id) => !isPluginEnabled(id),
  )
  return missingPlugins.length === 0
    ? { available: true }
    : { available: false, missingPlugins }
}

export function excludedSkillNotice(
  name: string,
  missingPlugins: string[],
): string {
  return t('ui.skillAvailability.skillExcludedFromThisRequestBecauseRequired', {
    p0: name,
    p1: missingPlugins.join(', '),
  })
}

export function filterAvailableSkills<
  T extends { name: string; requiredPlugins?: string[] },
>(skills: T[], isPluginEnabled: (id: string) => boolean) {
  const excludedSkillDetails: { name: string; missingPlugins: string[] }[] = []
  const activeSkills = skills.filter((skill) => {
    const availability = skillAvailability(skill, isPluginEnabled)
    if (availability.available) return true
    excludedSkillDetails.push({
      name: skill.name,
      missingPlugins: availability.missingPlugins,
    })
    return false
  })
  return {
    activeSkills,
    excludedSkills: excludedSkillDetails.map((skill) => skill.name),
    excludedSkillDetails,
  }
}

export { skillUnusableLabel } from './skillUnusableLabel'
