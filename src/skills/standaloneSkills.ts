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

/**
 * Recheck saved selections against today's catalog, preserving explicit picks.
 * A Skill whose id is no longer in the catalog is switched off and marked
 * `missing` so the UI can say why; it is never kept alive from the old snapshot.
 */
export function reconcileSelectedSkills(
  skills: ChatSkillContextItem[],
  currentSkills: readonly ChatSkillContextItem[],
  manualIds: Set<string>,
): ChatSkillContextItem[] {
  const catalog = new Map(currentSkills.map((skill) => [skill.id, skill]))
  return markManualSkills(skills, manualIds).map((skill) => {
    const current = catalog.get(skill.id)
    if (!current) return { ...skill, included: false, missing: true }
    const { missing: _missing, unusable: _unusable, ...rest } = skill
    return {
      ...rest,
      disableModelInvocation: current.disableModelInvocation,
      requiredPlugins: current.requiredPlugins,
      ...(current.unusable ? { unusable: current.unusable } : {}),
      included:
        skill.included &&
        !current.unusable &&
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
  selectedSkillIds: readonly string[],
  skills: readonly ChatSkillContextItem[],
): string[] {
  if (skillBoundWorkflowId) return [skillBoundWorkflowId]
  const selectedIds = new Set(selectedSkillIds)
  const standaloneActive = skills.some(
    (skill) => skill.standalone === true && selectedIds.has(skill.id),
  )
  return standaloneActive ? [] : [...llmWorkflowIds]
}

/** A triggered standalone skill excludes only non-standalone LLM-only recommendations. */
export function selectStandaloneCompatibleSkills(
  triggered: readonly string[],
  recommended: readonly string[],
  skills: readonly ChatSkillContextItem[],
): string[] {
  const triggeredIds = new Set(triggered)
  const standaloneTriggered = skills.some(
    (skill) => skill.standalone === true && triggeredIds.has(skill.id),
  )
  const allowed = standaloneTriggered
    ? recommended.filter(
        (id) =>
          triggeredIds.has(id) ||
          skills.some((skill) => skill.id === id && skill.standalone === true),
      )
    : recommended
  return [...new Set([...triggered, ...allowed])]
}

/** Shared automatic-selection merge; manual selections do not pass through here. */
export type WorkflowEvidence = {
  kind: 'keyword' | 'keyword_conflict' | 'treaty_size' | 'llm_only'
  /** Display names of the keyword Skills (shown to the user, not identifiers). */
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
    llmSkills: skills.filter((id) => !input.keywordSkills.includes(id)),
  })
  const compatibleOverride =
    override &&
    selectStandaloneCompatibleSkills(
      input.keywordSkills,
      override.skillIds,
      input.allSkills,
    ).length === override.skillIds.length
      ? override
      : null
  const selectedSkills = (compatibleOverride?.skillIds ?? skills).filter((id) =>
    isAutomaticallySelectable(
      input.allSkills.find((skill) => skill.id === id) ?? {},
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
  const keywordIds = new Set(input.keywordSkills)
  const declarations = input.allSkills.filter(
    (skill) =>
      keywordIds.has(skill.id) &&
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
          keywordIds.has(skill.id) &&
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
  const suggestedSkillIds: string[] = []
  const skillIds = selectedSkills.filter((id) => {
    const skill = input.allSkills.find((item) => item.id === id)
    if (
      !keywordIds.has(id) &&
      skill?.workflow &&
      !selectedWorkflowRefs.has(normalizeWorkflowRef(skill.workflow))
    ) {
      suggestedSkillIds.push(id)
      return false
    }
    return true
  })
  return {
    skillIds,
    workflowIds,
    suggestedSkillIds,
    suggestedWorkflowIds,
    workflowEvidence,
  }
}

export function restoreManualSkillIds(
  messages: readonly ChatMessage[],
): Set<string> {
  const latest = [...messages]
    .reverse()
    .find((message) => message.role === 'user')
  return new Set(
    latest?.skillContext
      ?.filter(
        (skill) =>
          skill.included &&
          !skill.missing &&
          skill.id !== '' &&
          skill.manuallySelected,
      )
      .map((skill) => skill.id) ?? [],
  )
}
export function markManualSkills(
  skills: ChatSkillContextItem[],
  ids: Set<string>,
): ChatSkillContextItem[] {
  return skills.map((skill) => ({
    ...skill,
    manuallySelected:
      skill.included && (skill.manuallySelected || ids.has(skill.id)),
  }))
}
export function toggleManualSkill(
  id: string,
  active: Set<string>,
  manual: Set<string>,
): void {
  if (active.has(id)) {
    active.delete(id)
    manual.delete(id)
  } else {
    active.add(id)
    manual.add(id)
  }
}

export function selectedManualIds(skills: ChatSkillContextItem[]): Set<string> {
  return new Set(
    skills
      .filter((skill) => skill.included && skill.manuallySelected)
      .map((skill) => skill.id),
  )
}
export function toggledManualIds(
  id: string,
  skills: ChatSkillContextItem[],
  manual: Set<string>,
): string[] {
  const active = new Set(
    skills.filter((skill) => skill.included).map((skill) => skill.id),
  )
  toggleManualSkill(id, active, manual)
  return [...active]
}

/** Only a direct picker toggle marks a Skill as manually selected. */
export function toggleSkillContext(
  skill: ChatSkillContextItem,
  id: string,
): ChatSkillContextItem {
  if (skill.missing || skill.id !== id) return skill
  if (skill.included) {
    const { source: _source, addedTurnId: _turn, ...rest } = skill
    return { ...rest, included: false, manuallySelected: false }
  }
  return { ...skill, included: true, manuallySelected: true, source: 'manual' }
}
