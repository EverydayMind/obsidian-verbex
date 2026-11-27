import type { LoadedSkill } from '../verbex/types'

import type { PluginSkillSource } from './pluginSkillSource'

/**
 * Adds what the plugin side knows after the merge: a Skill whose last body read
 * failed is listed with that reason, and Skills of providers that are waiting
 * for approval (or switched off) are listed with theirs. Neither can be
 * selected. With no such Skills the merged list is returned as it is.
 */
export function withPluginSkillStates(
  merged: LoadedSkill[],
  source: PluginSkillSource | null,
): LoadedSkill[] {
  if (!source) return merged
  const decorated = merged.map((skill) => {
    const reason = skill.origin ? source.faultOf?.(skill.id) : undefined
    return reason && !skill.unusable
      ? { ...skill, unusable: { code: 'body_failed' as const, detail: reason } }
      : skill
  })
  const taken = new Set(decorated.map((skill) => skill.id))
  const inactive = (source.listInactive?.() ?? [])
    .map((record) => record.skill)
    .filter((skill) => !taken.has(skill.id))
  return [...decorated, ...inactive]
}
