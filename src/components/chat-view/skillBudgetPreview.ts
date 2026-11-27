import { contextBudgetsForAlias } from '../../context/modelContextBudgets'
import { t } from '../../i18n'
import type { VerbexSettings } from '../../settings/schema/setting.types'
import {
  type SkillBudgetResult,
  applySkillBudget,
} from '../../skills/skillBudget'
import { stampSkillSources } from '../../skills/skillSelectionSource'
import type {
  ChatMessage,
  ChatSkillContextItem,
  ChatWorkflowContextItem,
} from '../../types/chat'

export type SkillBudgetInput = {
  settings: VerbexSettings
  skills: ChatSkillContextItem[]
  workflows: ChatWorkflowContextItem[]
  turnId: string
  messages: readonly ChatMessage[]
  contextType: string | null
  isPluginEnabled?: (id: string) => boolean
}

export const runSkillBudget = (
  input: SkillBudgetInput,
): Promise<SkillBudgetResult> =>
  applySkillBudget({
    skills: input.skills,
    workflows: input.workflows,
    budget: contextBudgetsForAlias(input.settings).skillTotal,
    turnId: input.turnId,
    turnOrder: input.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.id),
    contextType: input.contextType,
    isPluginEnabled: input.isPluginEnabled,
  })

/**
 * The same decision for the confirmation panel, recomputed on every toggle:
 * the Skills the budget would leave out if the user proceeds now.
 */
export async function previewSkillBudget(
  pending: {
    skillContext: ChatSkillContextItem[]
    workflowContext: ChatWorkflowContextItem[]
    keywordSkills: readonly string[]
    llmSkills: readonly string[]
    rawInputMessage: ChatMessage
  },
  input: Omit<SkillBudgetInput, 'skills' | 'workflows' | 'turnId'>,
): Promise<{ droppedIds: ReadonlySet<string>; summary: string | null }> {
  const turnId = pending.rawInputMessage.id
  const result = await runSkillBudget({
    ...input,
    turnId,
    workflows: pending.workflowContext,
    skills: stampSkillSources(pending.skillContext, {
      turnId,
      viaPanel: true,
      keywordIds: new Set(pending.keywordSkills),
      llmIds: new Set(pending.llmSkills),
    }),
  })
  return {
    droppedIds: new Set(result.dropped.map((entry) => entry.id)),
    summary: result.dropped.length
      ? t('contextBudget.previewHeader', {
          count: result.dropped.length,
          skills: result.dropped.map((entry) => entry.name).join(', '),
        })
      : result.manualOverflow
        ? t('contextBudget.manualOverflow', {
            used: result.total,
            budget: result.budget,
            skills: result.manualOverflow
              .map((entry) => `${entry.name} ${entry.tokens}`)
              .join(', '),
          })
        : null,
  }
}
