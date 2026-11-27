import type { App } from 'obsidian'

import { t } from '../i18n'
import type { ChangeOutcome } from '../workflow/StepExecutor'

import type { StarterFolders } from './starterAssets'
import { starterFolders } from './starterAssets'
import {
  type OutdatedStarterSkill,
  bundledFileFor,
  detectOutdatedFile,
} from './starterSkillUpdates'
import type { ProposedChange } from './types'

/** Host-only tool name: not in any model, workflow or Skill catalog. */
export const REPLACE_STARTER_SKILL_TOOL = 'replace_starter_skill'

export type StarterSkillReplaceResult = {
  replaced: number
  rejected: number
  /** Edited, removed or already current since it was listed. */
  changed: number
  failed: number
}

/**
 * The change that puts the bundled edition in place of an unedited old
 * copy. It always opens the Diff: see `replace_starter_skill` in
 * TOOL_REGISTRY (alwaysExplicitApproval), and the whole file is one decision.
 */
export function starterSkillChange(
  item: OutdatedStarterSkill,
  current: string,
): ProposedChange {
  return {
    id: `${REPLACE_STARTER_SKILL_TOOL}:${item.path}`,
    op: 'modify',
    kind: 'body',
    path: item.path,
    before: current,
    after: item.next,
    dangerous: false,
    tool: REPLACE_STARTER_SKILL_TOOL,
    approvalMode: 'whole_change',
    approvalNotes: [t('ui.StarterAssets.updateNote')],
  }
}

/**
 * Replaces each listed Skill file with the bundled edition, one Diff
 * approval per file. Every file is read and checked again right before its
 * change is built; one that is no longer an unedited old copy is skipped.
 */
export async function replaceStarterSkills(input: {
  app: App
  folders: StarterFolders
  items: readonly OutdatedStarterSkill[]
  process: (change: ProposedChange) => Promise<ChangeOutcome>
  /** The edition hash table; tests pass their own. */
  table?: Parameters<typeof detectOutdatedFile>[4]
}): Promise<StarterSkillReplaceResult> {
  const result: StarterSkillReplaceResult = {
    replaced: 0,
    rejected: 0,
    changed: 0,
    failed: 0,
  }
  const folders = starterFolders(input.folders)
  for (const item of input.items) {
    const file = bundledFileFor(item, folders)
    const fresh = file
      ? await detectOutdatedFile(
          input.app,
          folders,
          item.locale,
          file,
          input.table,
        )
      : null
    if (!fresh) {
      result.changed++
      continue
    }
    try {
      const outcome = await input.process(
        starterSkillChange(fresh, fresh.current),
      )
      if (outcome.status === 'applied') result.replaced++
      else if (outcome.status === 'rejected') result.rejected++
      else if (outcome.status === 'conflict') result.changed++
      else result.failed++
    } catch {
      result.failed++
    }
  }
  return result
}
