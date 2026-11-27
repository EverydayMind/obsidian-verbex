import type { ChatSkillContextItem } from '../../types/chat'

export type SkillGroup = {
  key: string
  /** Null: the only group, so no heading is needed. */
  label: string | null
  skills: ChatSkillContextItem[]
}

/**
 * Vault Skills first, then one group per providing plugin by display name.
 * With no plugin Skills there is one unlabeled group (the picker looks as it
 * did before plugins could provide Skills).
 */
export function groupSkillsForPicker(
  skills: readonly ChatSkillContextItem[],
  vaultLabel: string,
): SkillGroup[] {
  const vault = skills.filter((skill) => !skill.origin)
  const byPlugin = new Map<string, SkillGroup>()
  for (const skill of skills) {
    if (!skill.origin) continue
    const key = `plugin:${skill.origin.pluginId}`
    const group = byPlugin.get(key) ?? {
      key,
      label: skill.origin.pluginName,
      skills: [],
    }
    group.skills.push(skill)
    byPlugin.set(key, group)
  }
  if (byPlugin.size === 0) return [{ key: 'vault', label: null, skills: vault }]
  const plugins = [...byPlugin.values()].sort(
    (a, b) =>
      (a.label ?? '').localeCompare(b.label ?? '') ||
      a.key.localeCompare(b.key),
  )
  return [
    ...(vault.length > 0
      ? [{ key: 'vault', label: vaultLabel, skills: vault }]
      : []),
    ...plugins,
  ]
}
