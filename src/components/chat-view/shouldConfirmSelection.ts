import type {
  ChatSkillContextItem,
  ChatWorkflowContextItem,
} from '../../types/chat'

export function shouldConfirmSelection(selection: {
  recommendedSkillNames: readonly string[]
  recommendedWorkflowIds: readonly string[]
  suggestedWorkflowIds: readonly string[]
  suggestedSkillNames: readonly string[]
}): boolean {
  return [
    selection.recommendedSkillNames,
    selection.recommendedWorkflowIds,
    selection.suggestedWorkflowIds,
    selection.suggestedSkillNames,
  ].some((items) => items.length > 0)
}

export function selectedNamesFromContext(
  context: ChatSkillContextItem[] | undefined,
): string[] {
  return (
    context?.filter((skill) => skill.included).map((skill) => skill.name) ?? []
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
