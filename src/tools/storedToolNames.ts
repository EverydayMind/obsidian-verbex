import { Notice } from 'obsidian'

import { t } from '../i18n'

export function migrateStoredSkillTools<
  T extends { tools?: string[]; allowedTools?: string[] },
>(skill: T): T {
  return {
    ...skill,
    ...(skill.tools ? { tools: migrateStoredToolNames(skill.tools) } : {}),
    ...(skill.allowedTools
      ? { allowedTools: migrateStoredToolNames(skill.allowedTools) }
      : {}),
  }
}

export function migrateStoredToolSelection<
  T extends {
    pinnedConnectorTools?: string[]
    excludedToolNames?: string[]
  },
>(input: T): T {
  return {
    ...input,
    pinnedConnectorTools: migrateStoredToolNames(
      input.pinnedConnectorTools ?? [],
    ),
    excludedToolNames: migrateStoredToolNames(
      input.excludedToolNames ?? [],
      true,
    ),
  }
}

let reportedLegacyTool = false
export function migrateStoredToolNames(
  names: readonly string[],
  excluded = false,
): string[] {
  if (names.includes('context_candidates') && !reportedLegacyTool) {
    reportedLegacyTool = true
    const noticeKey = 'verbex:search-tool-consolidation:C3:v1'
    let alreadyNotified = false
    try {
      alreadyNotified = globalThis.localStorage?.getItem(noticeKey) === '1'
      globalThis.localStorage?.setItem(noticeKey, '1')
    } catch {
      // Storage can be disabled; the in-memory guard still prevents repeats.
    }
    if (!alreadyNotified) new Notice(t('ui.retiredSearchToolMigration'))
  }
  return [
    ...new Set(
      names.flatMap((name) =>
        name === 'context_candidates'
          ? excluded
            ? []
            : ['search_vault']
          : [name],
      ),
    ),
  ]
}
