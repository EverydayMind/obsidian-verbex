import type { App } from 'obsidian'

import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'
import type { HostSkillAssets } from '../provider/interop/hostCapabilities/hostSkillAssets'
import { pluginDisplayName } from '../provider/interop/pluginDisplayName'

import type { PluginSkillSource } from './pluginSkillSource'

export function hostPluginSkillSource(
  host: { skills: HostSkillAssets },
  app: App,
  locale: () => ModelLocale = getModelLocale,
): PluginSkillSource {
  const nameOf = (id: string, name: string) => pluginDisplayName(app, id, name)
  return {
    list: () => host.skills.list(locale(), nameOf),
    listInactive: () => host.skills.listInactive(locale(), nameOf),
    faultOf: (canonicalId) => host.skills.faultOf(canonicalId),
    clearFaults: () => host.skills.clearFaults(),
    readBody: async (canonicalId, signal) => {
      try {
        return await host.skills.read(canonicalId, locale(), signal)
      } catch {
        return { ok: false, reason: 'read_error' }
      }
    },
  }
}
