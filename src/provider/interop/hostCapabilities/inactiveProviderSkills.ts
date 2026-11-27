import type { SkillUnusable } from '../../../verbex/types'
import type { NativeProviderState } from '../hostScanTypes'

import {
  type PluginSkillRecord,
  type ProviderSkillState,
  summaryOf,
} from './providerSkillSource'

export type NameOf = (pluginId: string, descriptorName: string) => string

const REASONS: Partial<Record<NativeProviderState, SkillUnusable['code']>> = {
  pending: 'provider_pending',
  reapproval: 'provider_reapproval',
  disabled: 'provider_disabled',
}

/**
 * Skills of providers that are waiting for approval, waiting for reapproval or
 * switched off, in one language. They are listed so the user can see why they
 * cannot be used; each carries its reason and is never selectable. The source
 * is the status snapshot, which holds the assets in every state.
 */
export function inactiveProviderSkills(
  state: ProviderSkillState,
  locale: 'ko' | 'en',
  nameOf: NameOf,
): PluginSkillRecord[] {
  const records: PluginSkillRecord[] = []
  for (const status of state.statuses) {
    const code = REASONS[status.state]
    if (!code || !status.assets || status.providerId === 'vault') continue
    const pluginName = nameOf(
      status.providerId,
      status.descriptor?.provider.name ?? status.providerId,
    )
    for (const entry of status.assets.skills) {
      if (entry.locale !== locale) continue
      records.push({
        skill: {
          ...summaryOf(entry, status.providerId, pluginName),
          unusable: { code },
        },
        rawId: entry.id,
        names: [entry.frontmatter.name],
      })
    }
  }
  return records
}
