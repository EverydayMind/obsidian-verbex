import type {
  ChatSkillContextItem,
  ChatWorkflowContextItem,
} from '../../types/chat'

export function shouldConfirmSelection(selection: {
  recommendedSkillIds: readonly string[]
  recommendedWorkflowIds: readonly string[]
  suggestedWorkflowIds: readonly string[]
  suggestedSkillIds: readonly string[]
}): boolean {
  return [
    selection.recommendedSkillIds,
    selection.recommendedWorkflowIds,
    selection.suggestedWorkflowIds,
    selection.suggestedSkillIds,
  ].some((items) => items.length > 0)
}

export function selectedIdsFromContext(
  context: ChatSkillContextItem[] | undefined,
): string[] {
  return (
    context
      ?.filter((skill) => skill.included && !skill.missing && skill.id !== '')
      .map((skill) => skill.id) ?? []
  )
}
export function selectedWorkflowIdsFromContext(
  context: ChatWorkflowContextItem[] | undefined,
): string[] {
  const selected = context
    ?.filter((workflow) => workflow.included)
    .map((workflow) => workflow.id)
  return selected?.length === 1 ? selected : []
}

export function selectionWasChanged(
  selectedSkills: string[],
  selectedWorkflows: string[],
  recommendedSkills: string[],
  recommendedWorkflows: string[],
): boolean {
  const same = (selected: string[], recommended: string[]) =>
    selected.length === recommended.length &&
    selected.every((item) => recommended.includes(item))
  return (
    !same(selectedSkills, recommendedSkills) ||
    !same(selectedWorkflows, recommendedWorkflows)
  )
}
