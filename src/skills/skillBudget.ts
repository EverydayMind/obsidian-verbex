import type {
  ChatSkillContextItem,
  ChatWorkflowContextItem,
  SkillSelectionSource,
} from '../types/chat'
import { tokenCount } from '../utils/llm/token'
import { normalizeWorkflowRef } from '../workflow/workflowRef'

import { filterAvailableSkills } from './skillAvailability'
import { SkillRouter } from './SkillRouter'

export type SkillBudgetEntry = {
  id: string
  name: string
  source: SkillSelectionSource
  tokens: number
}

export type SkillBudgetResult = {
  skills: ChatSkillContextItem[]
  workflows: ChatWorkflowContextItem[]
  /** Skills taken out, in the order they were taken out. */
  dropped: SkillBudgetEntry[]
  /** Workflows taken out together with the Skill that attached them. */
  droppedWorkflowIds: string[]
  /** Active body tokens after the drops. */
  total: number
  budget: number
  /** Set when `manual` Skills alone exceed the budget; nothing is changed. */
  manualOverflow?: SkillBudgetEntry[]
}

const bodyTokens = new Map<string, number>()

/** Token count of an injected body (memoized); an unread plugin Skill counts its declared tokens. */
export async function skillBodyTokens(
  skill: Pick<
    ChatSkillContextItem,
    'instructions' | 'origin' | 'declaredBodyTokens'
  >,
): Promise<number> {
  const text = skill.instructions ?? ''
  if (!text) return skill.origin ? (skill.declaredBodyTokens ?? 0) : 0
  const known = bodyTokens.get(text)
  if (known !== undefined) return known
  const count = await tokenCount(text)
  if (bodyTokens.size >= 256) bodyTokens.clear()
  bodyTokens.set(text, count)
  return count
}

// Lower rank is taken out first. `manual` (and any item without a recorded
// source) is never taken out.
const DROP_RANK: Partial<Record<SkillSelectionSource, number>> = {
  llm: 1,
  confirmed: 3,
}

function dropRank(skill: ChatSkillContextItem, turnId: string): number | null {
  if (skill.manuallySelected) return null
  if (skill.source === 'keyword') return skill.addedTurnId === turnId ? 2 : 0
  return skill.source ? (DROP_RANK[skill.source] ?? null) : null
}

/**
 * The single budget decision for the Skills a turn will inject (B2). The
 * active set is what the turn would inject (included, usable, matching the
 * active tab and workflow, required plugins on); bodies are counted as
 * injected. Over budget, whole Skills leave in this order: keyword Skills of
 * earlier turns (oldest first), LLM picks, keyword Skills of this turn,
 * confirmed picks. Manual picks never leave. A Skill that leaves takes the
 * Workflow it attached with it, and its tool requirements, reservations and
 * cross-document scope go with it because they are read from the included
 * Skills.
 */
export async function applySkillBudget(input: {
  skills: readonly ChatSkillContextItem[]
  workflows: readonly ChatWorkflowContextItem[]
  budget: number
  /** Id of the turn being submitted. */
  turnId: string
  /** User message ids in conversation order, oldest first. */
  turnOrder: readonly string[]
  contextType: string | null
  isPluginEnabled?: (id: string) => boolean
}): Promise<SkillBudgetResult> {
  const routed = SkillRouter.filterActiveSkills(
    [...input.skills],
    [...input.workflows],
    input.contextType,
  )
  const active = filterAvailableSkills(
    routed,
    input.isPluginEnabled ?? (() => true),
  ).activeSkills
  const tokens = new Map<string, number>()
  for (const skill of active) tokens.set(skill.id, await skillBodyTokens(skill))
  const entry = (skill: ChatSkillContextItem): SkillBudgetEntry => ({
    id: skill.id,
    name: skill.name,
    source: skill.source ?? 'manual',
    tokens: tokens.get(skill.id) ?? 0,
  })
  const sum = (skills: readonly ChatSkillContextItem[]) =>
    skills.reduce((total, skill) => total + (tokens.get(skill.id) ?? 0), 0)
  const unchanged = (total: number): SkillBudgetResult => ({
    skills: [...input.skills],
    workflows: [...input.workflows],
    dropped: [],
    droppedWorkflowIds: [],
    total,
    budget: input.budget,
  })
  let total = sum(active)
  if (total <= input.budget) return unchanged(total)
  const protectedSkills = active.filter(
    (skill) => dropRank(skill, input.turnId) === null,
  )
  if (sum(protectedSkills) > input.budget)
    return {
      ...unchanged(total),
      manualOverflow: protectedSkills.map(entry),
    }
  const order = (id: string | undefined) => input.turnOrder.indexOf(id ?? '')
  const candidates = active
    .filter((skill) => dropRank(skill, input.turnId) !== null)
    .sort(
      (a, b) =>
        (dropRank(a, input.turnId) ?? 0) - (dropRank(b, input.turnId) ?? 0) ||
        order(a.addedTurnId) - order(b.addedTurnId) ||
        a.id.localeCompare(b.id, 'en'),
    )
  const dropped: SkillBudgetEntry[] = []
  const droppedIds = new Set<string>()
  for (const skill of candidates) {
    if (total <= input.budget) break
    droppedIds.add(skill.id)
    dropped.push(entry(skill))
    total -= tokens.get(skill.id) ?? 0
  }
  const remaining = input.skills.filter(
    (skill) => skill.included && !droppedIds.has(skill.id),
  )
  const stillDeclared = new Set(
    remaining.flatMap((skill) =>
      skill.workflow ? [normalizeWorkflowRef(skill.workflow)] : [],
    ),
  )
  const attachedByDropped = new Set(
    input.skills
      .filter((skill) => droppedIds.has(skill.id) && skill.workflow)
      .map((skill) => normalizeWorkflowRef(skill.workflow ?? '')),
  )
  const droppedWorkflowIds: string[] = []
  const workflows = input.workflows.map((workflow) => {
    const ref = normalizeWorkflowRef(workflow.id)
    if (!workflow.included || !attachedByDropped.has(ref)) return workflow
    if (stillDeclared.has(ref)) return workflow
    droppedWorkflowIds.push(workflow.id)
    return { ...workflow, included: false }
  })
  return {
    skills: input.skills.map((skill) =>
      droppedIds.has(skill.id) ? { ...skill, included: false } : skill,
    ),
    workflows,
    dropped,
    droppedWorkflowIds,
    total,
    budget: input.budget,
  }
}
