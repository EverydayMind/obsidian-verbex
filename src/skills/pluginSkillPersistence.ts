import type { ChatSkillContextItem } from '../types/chat'

/**
 * A plugin-provided Skill body is read and verified for each request and is
 * never stored (host-capabilities-v1 README section 2). Vault Skills keep their
 * stored instructions as before.
 */
export function withoutPluginSkillBody(
  skill: ChatSkillContextItem,
): ChatSkillContextItem {
  if (!skill.origin) return skill
  const { instructions: _body, ...rest } = skill
  return rest
}
