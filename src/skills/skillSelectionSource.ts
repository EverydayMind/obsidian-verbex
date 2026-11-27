import { migrateStoredSkillTools } from '../tools/storedToolNames'
import type {
  ChatMessage,
  ChatSkillContextItem,
  SkillSelectionSource,
} from '../types/chat'

import {
  type SkillCatalogEntry,
  type StoredSkillContextEntry,
  resolveLegacySkillContext,
} from './legacySkillSelection'

export type SkillSourceStampInput = {
  /** User message id of the turn being submitted. */
  turnId: string
  /** Contexts of earlier turns: a Skill keeps its source and first turn. */
  previous?: readonly ChatSkillContextItem[]
  /** The automatic recommendation was shown to and accepted by the user. */
  viaPanel?: boolean
  /** Ids activated by trigger keywords on this turn. */
  keywordIds?: ReadonlySet<string>
  /** Ids activated by the LLM selector on this turn. */
  llmIds?: ReadonlySet<string>
}

/**
 * The latest earlier user message's Skill context, which carries the sources
 * and first-added turns that a new turn must keep.
 */
export function previousSkillContext(
  messages: readonly ChatMessage[],
  turnId: string,
): ChatSkillContextItem[] {
  const index = messages.findIndex((message) => message.id === turnId)
  const earlier = index < 0 ? messages : messages.slice(0, index)
  for (let i = earlier.length - 1; i >= 0; i -= 1) {
    const message = earlier[i]
    if (message.role === 'user' && message.skillContext)
      return message.skillContext
  }
  return []
}

/**
 * Records how each included Skill entered the selection (recording only; the
 * budget demotion that will use it is a later unit). Resolution order:
 * manual flag, the item's own source, the earlier turn's source, then this
 * turn's evidence. A Skill with no evidence is treated as manual so it can
 * never be demoted by mistake. `addedTurnId` is the first turn that included it
 * and is never changed by later turns.
 */
export function stampSkillSources(
  skills: ChatSkillContextItem[],
  input: SkillSourceStampInput,
): ChatSkillContextItem[] {
  const previous = new Map<string, ChatSkillContextItem>()
  for (const skill of input.previous ?? [])
    if (skill.included) previous.set(skill.id, skill)
  return skills.map((skill) => {
    if (!skill.included) {
      const { source: _source, addedTurnId: _turn, ...rest } = skill
      return rest
    }
    const earlier = previous.get(skill.id)
    // A stale `manual` without the flag (the selection was reset to auto) is not
    // evidence of a user pick.
    const inherited = [skill.source, earlier?.source].find(
      (source) => source && (source !== 'manual' || skill.manuallySelected),
    )
    const source: SkillSelectionSource = skill.manuallySelected
      ? 'manual'
      : (inherited ??
        (input.viaPanel
          ? 'confirmed'
          : input.keywordIds?.has(skill.id)
            ? 'keyword'
            : input.llmIds?.has(skill.id)
              ? 'llm'
              : 'manual'))
    return {
      ...skill,
      source,
      addedTurnId: skill.addedTurnId ?? earlier?.addedTurnId ?? input.turnId,
    }
  })
}

const SOURCES: readonly SkillSelectionSource[] = [
  'manual',
  'confirmed',
  'keyword',
  'llm',
]

/** Reads a stored Skill context, resolving legacy id-less items when possible. */
export function readStoredSkillContext(
  stored: readonly StoredSkillContextEntry[] | undefined,
  catalog?: readonly SkillCatalogEntry[],
): ChatSkillContextItem[] | undefined {
  return resolveLegacySkillContext(stored, catalog)?.map((skill) => {
    const migrated = migrateStoredSkillTools(skill)
    return migrated.source && !SOURCES.includes(migrated.source)
      ? { ...migrated, source: undefined }
      : migrated
  })
}
