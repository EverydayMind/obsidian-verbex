import type { LoadedSkill } from '../../../verbex/types'
import type { Discovered, NativeProviderStatus } from '../hostScanTypes'
import type { NativeProviderApproval } from '../protocol'
import { providerIsActive } from '../providerApproval'

import type { SkillAssetEntry } from './skillAssets'

/** A plugin Skill as the catalog sees it: no body (it is read lazily). */
export type PluginSkillRecord = {
  skill: LoadedSkill
  /** The provider's own Skill id (the part after `<pluginId>:`). */
  rawId: string
  /** The display names of every language edition (same-Skill detection). */
  names: string[]
}

export type ProviderSkillState = {
  discovered: ReadonlyMap<string, Discovered>
  statuses: readonly NativeProviderStatus[]
  approvals: readonly NativeProviderApproval[]
  faulted: (found: Discovered) => boolean
}

/** `vault:` is the vault Skill namespace; a plugin may not claim it. */
const RESERVED_PLUGIN_ID = 'vault'

export function pluginSkillId(pluginId: string, skillId: string): string {
  return `${pluginId}:${skillId}`
}

/** Providers whose Skills may be listed: approved and active, with assets. */
export function activeAssetProviders(state: ProviderSkillState): Discovered[] {
  return [...state.discovered.values()].filter(
    (found) =>
      !!found.assets &&
      found.handle.pluginId !== RESERVED_PLUGIN_ID &&
      !state.faulted(found) &&
      providerIsActive(state.statuses, found.handle.pluginId, state.approvals),
  )
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

export function summaryOf(
  entry: SkillAssetEntry,
  pluginId: string,
  pluginName: string,
): LoadedSkill {
  const fm = entry.frontmatter
  const requiredPlugins = unique([...(fm['required-plugins'] ?? []), pluginId])
  return {
    id: pluginSkillId(pluginId, entry.id),
    name: fm.name,
    description: fm.description,
    overview: fm.description,
    path: '',
    body: '',
    trigger_keywords: [...(fm.trigger_keywords ?? [])],
    ...(fm.applies_to ? { applies_to: [...fm.applies_to] } : {}),
    ...(fm.tools ? { tools: [...fm.tools] } : {}),
    ...(fm['allowed-tools'] ? { allowedTools: [...fm['allowed-tools']] } : {}),
    ...(fm['preferred-tools']
      ? { preferredTools: [...fm['preferred-tools']] }
      : {}),
    requiredPlugins,
    ...(fm['requires-host-tools']?.length
      ? { requiresHostTools: [...fm['requires-host-tools']] }
      : {}),
    ...(fm.workflow ? { workflow: fm.workflow } : {}),
    ...(fm.standalone === true ? { standalone: true } : {}),
    ...(fm.cross_document === true ? { cross_document: true } : {}),
    ...(fm['disable-model-invocation'] === true
      ? { disableModelInvocation: true }
      : {}),
    origin: { pluginId, pluginName },
    declaredBodyTokens: entry.bodyTokens,
  }
}

/**
 * The Skills of active providers in one language, from the assets snapshot
 * (a provider without tools is included). Other editions are not substituted.
 */
export function providerSkills(
  state: ProviderSkillState,
  locale: 'ko' | 'en',
  nameOf: (pluginId: string, descriptorName: string) => string,
): PluginSkillRecord[] {
  const records: PluginSkillRecord[] = []
  for (const found of activeAssetProviders(state)) {
    const pluginId = found.handle.pluginId
    const pluginName = nameOf(pluginId, found.descriptor.provider.name)
    for (const entry of found.assets?.skills ?? []) {
      if (entry.locale !== locale) continue
      records.push({
        skill: summaryOf(entry, pluginId, pluginName),
        rawId: entry.id,
        names: unique(
          (found.assets?.skills ?? [])
            .filter((other) => other.id === entry.id)
            .map((other) => other.frontmatter.name),
        ),
      })
    }
  }
  return records
}
