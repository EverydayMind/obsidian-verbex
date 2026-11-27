import { ChatSkillContextItem } from '../types/chat'
import { SelectionSizeFact } from '../utils/obsidian'
import { normalizeWorkflowRef } from '../workflow/workflowRef'

export const TREATY_WORKFLOW_IDS = new Set([
  'treaty-review',
  'treaty-wiki-review',
])

export type TreatyAwareSelection = {
  skillIds: string[]
  workflowIds: string[]
}

export type TreatyAwareSelectionInput = {
  sizeFact: SelectionSizeFact | null
  skillBoundWorkflowId: string | null
  llmWorkflowIds: readonly string[]
  keywordSkills: readonly string[]
  llmSkills: readonly string[]
  allSkills: readonly ChatSkillContextItem[]
}

/**
 * Let the size-aware selector replace a generic treaty keyword binding only
 * when both sides resolve to the treaty pair and the selected workflow has a
 * matching Skill. Otherwise the caller keeps the existing deterministic
 * binding, failing closed instead of producing a workflow with no Skill.
 */
export function resolveTreatyAwareSelection(
  input: TreatyAwareSelectionInput,
): TreatyAwareSelection | null {
  if (!input.sizeFact) return null

  const boundWorkflowId = input.skillBoundWorkflowId
    ? normalizeWorkflowRef(input.skillBoundWorkflowId)
    : null
  const llmWorkflowId = input.llmWorkflowIds[0]
    ? normalizeWorkflowRef(input.llmWorkflowIds[0])
    : null

  if (
    !boundWorkflowId ||
    !llmWorkflowId ||
    !TREATY_WORKFLOW_IDS.has(boundWorkflowId) ||
    !TREATY_WORKFLOW_IDS.has(llmWorkflowId) ||
    boundWorkflowId === llmWorkflowId
  ) {
    return null
  }

  const matchingSkills = input.allSkills.filter(
    (skill) =>
      skill.workflow && normalizeWorkflowRef(skill.workflow) === llmWorkflowId,
  )
  if (matchingSkills.length === 0) return null

  return {
    skillIds: [
      ...new Set([
        ...input.keywordSkills,
        ...input.llmSkills,
        ...matchingSkills.map((skill) => skill.id),
      ]),
    ],
    workflowIds: [llmWorkflowId],
  }
}
