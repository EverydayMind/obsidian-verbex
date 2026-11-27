import { t } from '../../i18n'
import type { PluginSkillBody } from '../../skills/pluginSkillSource'
import type { ChatSkillContextItem } from '../../types/chat'

export type PluginSkillFailure = {
  id: string
  name: string
  pluginName: string
  reason: string
}

/**
 * Reads the bodies of the included plugin Skills just before injection. A Skill
 * whose body cannot be verified is dropped from this request only; every other
 * Skill, vault or plugin, passes through untouched (same objects).
 */
export async function injectPluginSkillBodies(
  items: ChatSkillContextItem[],
  read: (id: string) => Promise<PluginSkillBody>,
  fit: (body: string) => Promise<string>,
): Promise<{ items: ChatSkillContextItem[]; failures: PluginSkillFailure[] }> {
  const failures: PluginSkillFailure[] = []
  const next: ChatSkillContextItem[] = []
  for (const item of items) {
    if (!item.origin) {
      next.push(item)
      continue
    }
    // A stored body is never trusted: only a body read now is injected.
    const { instructions: _stored, ...rest } = item
    if (!item.included) {
      next.push(rest)
      continue
    }
    const result = await read(item.id)
    if (result.ok) {
      next.push({ ...rest, instructions: await fit(result.body) })
      continue
    }
    failures.push({
      id: item.id,
      name: item.name,
      pluginName: item.origin.pluginName,
      reason: result.reason,
    })
    next.push({ ...rest, included: false })
  }
  return { items: next, failures }
}

/** One fact line for the chat: which Skill was left out, and the reason code. */
export function pluginSkillFailureNotice(failure: PluginSkillFailure): string {
  return t('nativeProviderR10.skillBodyFailed', {
    name: failure.name,
    plugin: failure.pluginName,
    reason: failure.reason,
  })
}
