import { ChatSkillContextItem, ChatWorkflowContextItem } from '../types/chat'
import { normalizeWorkflowRef } from '../workflow/workflowRef'

import { skillAppliesToContext } from './skillScope'

export class SkillRouter {
  /**
   * Resolve the single runnable workflow declared by keyword-matched skills.
   * Conflicting declarations return null.
   */
  static resolveSkillBoundWorkflow(
    keywordSkillNames: readonly string[],
    skills: readonly ChatSkillContextItem[],
    runnableWorkflowIds: readonly string[],
  ): string | null {
    const keywordNames = new Set(keywordSkillNames)
    const runnableByNormalizedId = new Map(
      runnableWorkflowIds.map((id) => [normalizeWorkflowRef(id), id]),
    )
    const resolved = new Set<string>()

    for (const skill of skills) {
      if (!keywordNames.has(skill.name) || !skill.workflow) continue
      const workflowId = runnableByNormalizedId.get(
        normalizeWorkflowRef(skill.workflow),
      )
      if (workflowId) resolved.add(workflowId)
    }

    return resolved.size === 1 ? [...resolved][0] : null
  }

  /**
   * Filters active skills based on active context type and selected workflow IDs
   * to prevent workflow/skill mismatches.
   */
  static filterActiveSkills(
    skills?: ChatSkillContextItem[],
    workflows?: ChatWorkflowContextItem[],
    activeContextType?: string | null,
  ): ChatSkillContextItem[] {
    const includedWorkflows = workflows?.filter((w) => w.included) ?? []
    const activeWorkflowIds = new Set(
      includedWorkflows.map((w) => normalizeWorkflowRef(w.id)),
    )

    return (
      skills?.filter((skill) => {
        if (
          !skill.included ||
          !skillAppliesToContext(skill.appliesTo, activeContextType)
        ) {
          return false
        }
        if (
          skill.workflow &&
          activeWorkflowIds.size > 0 &&
          !activeWorkflowIds.has(normalizeWorkflowRef(skill.workflow))
        ) {
          console.debug(
            `[Verbex][selection] Excluding workflow-mismatched skill "${skill.name}" (${skill.workflow}).`,
          )
          return false
        }
        return true
      }) ?? []
    )
  }

  /**
   * Evaluates if a request should fall back to basic LLM chat instead of triggering skills/workflows.
   */
  static isFallbackToLLM(
    request: string,
    activeSkills: { tools?: string[] }[] = [],
  ): boolean {
    // If no active skills have any custom tools, or request represents a basic talk, fall back to LLM
    const hasActiveTools = activeSkills.some(
      (skill) => skill.tools && skill.tools.length > 0,
    )
    if (!hasActiveTools) {
      return true
    }
    return false
  }
}
