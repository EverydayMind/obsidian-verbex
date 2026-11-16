import { ChatMessage, ChatSkillContextItem } from '../types/chat'
import { normalizeWorkflowRef } from '../workflow/workflowRef'

import {
  type TreatyAwareSelectionInput,
  resolveTreatyAwareSelection,
} from './treatySelection'

export function isAutomaticallySelectable(skill: {
  disableModelInvocation?: boolean
}): boolean {
  return skill.disableModelInvocation !== true
}

/** Recheck saved selections against today's catalog, preserving explicit picks. */
export function reconcileSelectedSkills(
  skills: ChatSkillContextItem[],
  currentSkills: readonly ChatSkillContextItem[],
  manualNames: Set<string>,
): ChatSkillContextItem[] {
  const catalog = new Map(currentSkills.map((skill) => [skill.name, skill]))
  return markManualSkills(skills, manualNames).map((skill) => {
    const current = catalog.get(skill.name) ?? skill
    return {
      ...skill,
      disableModelInvocation: current.disableModelInvocation,
      requiredPlugins: current.requiredPlugins,
      included:
        skill.included &&
        (isAutomaticallySelectable(current) || skill.manuallySelected === true),
    }
  })
}

/**
 * Workflow guides for the first selection: a guide bound by a keyword-matched
 * skill wins; otherwise the LLM selector's suggestion, unless a selected
 * `standalone` skill (keyword- or LLM-selected) overrides it. Such a skill
 * carries its own complete procedure (for example measuring an HWPX sample
 * and exporting through a derived template), and a generic guide attached next
 * to it steers a small model into a conflicting procedure (a Markdown-only
 * report that asks for a destination and reads only the current note).
 */
export function workflowGuidesForSelection(
  skillBoundWorkflowId: string | null,
  llmWorkflowIds: readonly string[],
  selectedSkillNames: readonly string[],
  skills: readonly ChatSkillContextItem[],
): string[] {
  if (skillBoundWorkflowId) return [skillBoundWorkflowId]
  const selectedNames = new Set(selectedSkillNames)
  const standaloneActive = skills.some(
    (skill) => skill.standalone === true && selectedNames.has(skill.name),
  )
  return standaloneActive ? [] : [...llmWorkflowIds]
}

/** A triggered standalone skill excludes only non-standalone LLM-only recommendations. */
export function selectStandaloneCompatibleSkills(
  triggered: readonly string[],
  recommended: readonly string[],
  skills: readonly ChatSkillContextItem[],
): string[] {
  const triggeredNames = new Set(triggered)
  const standaloneTriggered = skills.some(
    (skill) => skill.standalone === true && triggeredNames.has(skill.name),
  )
  const allowed = standaloneTriggered
    ? recommended.filter(
        (name) =>
          triggeredNames.has(name) ||
          skills.some(
            (skill) => skill.name === name && skill.standalone === true,
          ),
      )
    : recommended
  return [...new Set([...triggered, ...allowed])]
}

/** Shared automatic-selection merge; manual selections do not pass through here. */
export type WorkflowEvidence = {
  kind: 'keyword' | 'keyword_conflict' | 'treaty_size' | 'llm_only'
  skillNames?: string[]
}

export function resolveAutomaticSkills(
  input: TreatyAwareSelectionInput & {
    runnableWorkflowIds?: readonly string[]
  },
) {
  const skills = selectStandaloneCompatibleSkills(
    input.keywordSkills,
    input.llmSkills,
    input.allSkills,
  )
  const override = resolveTreatyAwareSelection({
    ...input,
    llmSkills: skills.filter((name) => !input.keywordSkills.includes(name)),
  })
  const compatibleOverride =
    override &&
    selectStandaloneCompatibleSkills(
      input.keywordSkills,
      override.skillNames,
      input.allSkills,
    ).length === override.skillNames.length
      ? override
      : null
  const selectedSkills = (compatibleOverride?.skillNames ?? skills).filter(
    (name) =>
      isAutomaticallySelectable(
        input.allSkills.find((skill) => skill.name === name) ?? {},
      ),
  )
  const candidates =
    compatibleOverride?.workflowIds ??
    workflowGuidesForSelection(
      input.skillBoundWorkflowId,
      input.llmWorkflowIds,
      skills,
      input.allSkills,
    )
  const runnable = new Set(
    (input.runnableWorkflowIds ?? []).map(normalizeWorkflowRef),
  )
  const keywordNames = new Set(input.keywordSkills)
  const declarations = input.allSkills.filter(
    (skill) =>
      keywordNames.has(skill.name) &&
      skill.workflow &&
      runnable.has(normalizeWorkflowRef(skill.workflow)),
  )
  const conflict =
    new Set(
      declarations.map((skill) => normalizeWorkflowRef(skill.workflow ?? '')),
    ).size > 1
  const workflowEvidence: Record<string, WorkflowEvidence> = {}
  const workflowIds: string[] = []
  const suggestedWorkflowIds: string[] = []
  for (const id of candidates) {
    const names = input.allSkills
      .filter(
        (skill) =>
          keywordNames.has(skill.name) &&
          skill.workflow &&
          normalizeWorkflowRef(skill.workflow) === normalizeWorkflowRef(id),
      )
      .map((skill) => skill.name)
    const kind = compatibleOverride
      ? 'treaty_size'
      : input.skillBoundWorkflowId
        ? 'keyword'
        : conflict && names.length
          ? 'keyword_conflict'
          : 'llm_only'
    workflowEvidence[id] =
      names.length && (kind === 'keyword' || kind === 'keyword_conflict')
        ? { kind, skillNames: names }
        : { kind }
    ;(kind === 'llm_only' ? suggestedWorkflowIds : workflowIds).push(id)
  }
  const selectedWorkflowRefs = new Set(workflowIds.map(normalizeWorkflowRef))
  const suggestedSkillNames: string[] = []
  const skillNames = selectedSkills.filter((name) => {
    const skill = input.allSkills.find((item) => item.name === name)
    if (
      !keywordNames.has(name) &&
      skill?.workflow &&
      !selectedWorkflowRefs.has(normalizeWorkflowRef(skill.workflow))
    ) {
      suggestedSkillNames.push(name)
      return false
    }
    return true
  })
  return {
    skillNames,
    workflowIds,
    suggestedSkillNames,
    suggestedWorkflowIds,
    workflowEvidence,
  }
}

export function restoreManualSkillNames(
  messages: readonly ChatMessage[],
): Set<string> {
  const latest = [...messages]
    .reverse()
    .find((message) => message.role === 'user')
  return new Set(
    latest?.skillContext
      ?.filter((skill) => skill.included && skill.manuallySelected)
      .map((skill) => skill.name) ?? [],
  )
}
export function markManualSkills(
  skills: ChatSkillContextItem[],
  names: Set<string>,
): ChatSkillContextItem[] {
  return skills.map((skill) => ({
    ...skill,
    manuallySelected:
      skill.included && (skill.manuallySelected || names.has(skill.name)),
  }))
}
export function toggleManualSkill(
  name: string,
  active: Set<string>,
  manual: Set<string>,
): void {
  if (active.has(name)) {
    active.delete(name)
    manual.delete(name)
  } else {
    active.add(name)
    manual.add(name)
  }
}

export function selectedManualNames(
  skills: ChatSkillContextItem[],
): Set<string> {
  return new Set(
    skills
      .filter((skill) => skill.included && skill.manuallySelected)
      .map((skill) => skill.name),
  )
}
export function toggledManualNames(
  name: string,
  skills: ChatSkillContextItem[],
  manual: Set<string>,
): string[] {
  const active = new Set(
    skills.filter((skill) => skill.included).map((skill) => skill.name),
  )
  toggleManualSkill(name, active, manual)
  return [...active]
}

/** Only a direct picker toggle marks a Skill as manually selected. */
export function toggleSkillContext(
  skill: ChatSkillContextItem,
  name: string,
): ChatSkillContextItem {
  return skill.name === name
    ? { ...skill, included: !skill.included, manuallySelected: !skill.included }
    : skill
}
