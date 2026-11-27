import type { PluginSkillRecord } from '../provider/interop/hostCapabilities/providerSkillSource'
import type { LoadedSkill } from '../verbex/types'

/** SHA-256 hex lists of unedited old starter copies, keyed by Skill id. */
export type RetiredStarterHashes = Readonly<Record<string, readonly string[]>>

export type SkillMergeInput = {
  vault: readonly LoadedSkill[]
  plugin: readonly PluginSkillRecord[]
  retired: RetiredStarterHashes
  /** SHA-256 of a vault Skill file (CRLF normalized); undefined if unreadable. */
  vaultHash: (skill: LoadedSkill) => Promise<string | undefined>
  /** Whether a built-in tool of this name exists in the host. */
  hostToolKnown: (name: string) => boolean
}

function vaultFolder(skill: LoadedSkill): string {
  return skill.id.startsWith('vault:')
    ? skill.id.slice('vault:'.length)
    : skill.id
}

/** Same Skill: folder name equals the plugin id, or the display names match. */
function sameSkill(vault: LoadedSkill, plugin: PluginSkillRecord): boolean {
  return (
    vaultFolder(vault) === plugin.rawId || plugin.names.includes(vault.name)
  )
}

function withHostToolCheck(
  skill: LoadedSkill,
  known: (name: string) => boolean,
): LoadedSkill {
  if (skill.unusable || !skill.requiresHostTools?.length) return skill
  const missing = skill.requiresHostTools.filter((name) => !known(name))
  return missing.length === 0
    ? skill
    : {
        ...skill,
        unusable: { code: 'missing_host_tools', detail: missing.join(', ') },
      }
}

/**
 * One Skill list from the vault and the active plugins. A same Skill appears
 * once as usable: an unedited old starter copy in the vault yields to the
 * plugin edition; an edited copy shadows the plugin edition. The losing side
 * stays listed with a reason and can be neither selected nor injected.
 * With no plugin Skills and no `requires-host-tools`, the vault list is
 * returned as it is.
 */
export async function mergeSkillCatalog(
  input: SkillMergeInput,
): Promise<LoadedSkill[]> {
  const legacy = new Set<LoadedSkill>()
  const shadowed = new Set<PluginSkillRecord>()
  for (const plugin of input.plugin) {
    for (const vault of input.vault) {
      if (!sameSkill(vault, plugin)) continue
      const known = new Set([
        ...(input.retired[plugin.rawId] ?? []),
        ...(input.retired[vaultFolder(vault)] ?? []),
      ])
      const hash = known.size > 0 ? await input.vaultHash(vault) : undefined
      if (hash !== undefined && known.has(hash)) legacy.add(vault)
      else shadowed.add(plugin)
    }
  }
  const fromVault = input.vault.map((skill) =>
    legacy.has(skill)
      ? { ...skill, unusable: { code: 'legacy_starter_copy' as const } }
      : skill,
  )
  const fromPlugins = input.plugin
    .map((plugin) =>
      shadowed.has(plugin)
        ? {
            ...plugin.skill,
            unusable: { code: 'shadowed_by_vault' as const },
          }
        : plugin.skill,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  return [...fromVault, ...fromPlugins].map((skill) =>
    withHostToolCheck(skill, input.hostToolKnown),
  )
}
