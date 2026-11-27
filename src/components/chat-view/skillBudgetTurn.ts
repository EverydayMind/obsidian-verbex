import { t } from '../../i18n'
import type {
  SkillBudgetEntry,
  SkillBudgetResult,
} from '../../skills/skillBudget'

import { type SkillBudgetInput, runSkillBudget } from './skillBudgetPreview'

export { previewSkillBudget } from './skillBudgetPreview'
export type { SkillBudgetInput } from './skillBudgetPreview'

const label = (entry: SkillBudgetEntry) =>
  `${entry.name} (${t(`contextBudget.source.${entry.source}`)}, ${entry.tokens})`

/** The same Skills the panel already announced: no second notice. */
const sameDrop = (
  result: SkillBudgetResult,
  previewed: ReadonlySet<string> | undefined,
) =>
  !!previewed &&
  previewed.size === result.dropped.length &&
  result.dropped.every((entry) => previewed.has(entry.id))

/**
 * The one budget decision of a submission (B2), made after the selection is
 * final and the Skills carry their sources. Returns the contexts to submit,
 * the chat fact lines, the debug record and, when the user's own picks exceed
 * the budget, the fact that stops the submission.
 */
export async function budgetSubmissionSkills(
  input: SkillBudgetInput & {
    /** Skills the confirmation panel already showed as left out. */
    previewedDropIds?: ReadonlySet<string>
    /** Shows a fact to the user (Notice). */
    notify?: (text: string) => void
    /** Writes the debug record of a budget decision. */
    record?: (details: Record<string, number | string | boolean>) => void
  },
) {
  const result = await runSkillBudget(input)
  const facts: string[] = []
  let blocked: string | undefined
  if (result.manualOverflow)
    blocked = t('contextBudget.manualOverflow', {
      used: result.total,
      budget: result.budget,
      skills: result.manualOverflow
        .map((entry) => `${entry.name} ${entry.tokens}`)
        .join(', '),
    })
  else if (result.dropped.length && !sameDrop(result, input.previewedDropIds))
    facts.push(
      t('contextBudget.skillsDropped', {
        used: result.total,
        budget: result.budget,
        skills: result.dropped.map(label).join(', '),
      }),
    )
  for (const text of [...facts, ...(blocked ? [blocked] : [])])
    input.notify?.(text)
  if (result.dropped.length)
    input.record?.({
      skillBudget: result.budget,
      skillTokens: result.total,
      droppedSkills: result.dropped
        .map((entry) => `${entry.id}|${entry.source}|${entry.tokens}`)
        .join(','),
      droppedWorkflows: result.droppedWorkflowIds.join(','),
    })
  return {
    skills: result.skills,
    workflows: result.workflows,
    facts,
    blocked,
    dropped: result.dropped,
  }
}

/** Debug record of the selector request budget (B1); absent when nothing was left out. */
export function selectorBudgetDetails(generator: {
  lastSelectionOmitted: number
}): Record<string, number> | undefined {
  return generator.lastSelectionOmitted > 0
    ? { selectorOmittedSkills: generator.lastSelectionOmitted }
    : undefined
}
