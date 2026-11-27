import { Bm25Index } from '../../core/rag/bm25'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import { skillAppliesToContext } from '../../skills/skillScope'
import { tokenCount } from '../llm/token'

export type SelectionCandidate = {
  id: string
  name: string
  overview: string
  applies_to?: string[]
}

type Count = (text: string) => Promise<number>

/** One Skill's share of the selector request: its overview line and enum entry. */
export const skillOverviewLine = (skill: SelectionCandidate) =>
  `- "${skill.name}": ${skill.overview}`
const enumEntry = (skill: SelectionCandidate) =>
  `${JSON.stringify(skill.name)},`

/** The fact line placed in the selector request when Skills were left out. */
export function selectionOmissionFact(omitted: number): string {
  return L({
    ko: `${modelMarker('hostFact', 'ko')} 요청 예산 때문에 Skill ${omitted}개를 이 목록에서 뺐다. 목록에 없는 Skill은 고를 수 없다.`,
    en: `${modelMarker('hostFact', 'en')} ${omitted} Skills were left out of this list to fit the request budget. Skills not listed cannot be chosen.`,
  })
}

/**
 * Keeps the Skills that fit the selector request budget. Nothing changes while
 * everything fits. Otherwise: Skills whose `applies_to` does not match the
 * active tab go first; the rest are ranked by BM25 overlap of the request with
 * the display name and overview (ties by id) and kept while they fit. Disabled
 * and unapproved plugin Skills are already absent from the candidates. `fixed`
 * is every other part of the request (instructions, workflow overviews, size
 * facts, query, schema skeleton) and counts against the same budget.
 */
export async function fitSelectionSkills<T extends SelectionCandidate>(input: {
  skills: readonly T[]
  fixed: string
  budget: number
  query: string
  contextType: string | null
  count?: Count
}): Promise<{ skills: T[]; omitted: number }> {
  const count = input.count ?? tokenCount
  const costs = new Map<string, number>()
  for (const skill of input.skills)
    costs.set(
      skill.id,
      (await count(skillOverviewLine(skill))) + (await count(enumEntry(skill))),
    )
  const total = (skills: readonly T[]) =>
    skills.reduce((sum, skill) => sum + (costs.get(skill.id) ?? 0), 0)
  const fixed = await count(input.fixed)
  if (fixed + total(input.skills) <= input.budget)
    return { skills: [...input.skills], omitted: 0 }
  const scoped = input.skills.filter((skill) =>
    skillAppliesToContext(skill.applies_to, input.contextType),
  )
  const room =
    input.budget -
    fixed -
    (await count(selectionOmissionFact(input.skills.length)))
  if (total(scoped) <= room)
    return { skills: scoped, omitted: input.skills.length - scoped.length }
  const scores = new Map<string, number>()
  const index = new Bm25Index(
    scoped.map((skill) => `${skill.name}\n${skill.overview}`),
  )
  for (const hit of index.search(input.query))
    scores.set(scoped[hit.index].id, hit.score)
  const ranked = [...scoped].sort(
    (a, b) =>
      (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) ||
      a.id.localeCompare(b.id, 'en'),
  )
  const kept: T[] = []
  let used = 0
  for (const skill of ranked) {
    const cost = costs.get(skill.id) ?? 0
    if (used + cost > room) break
    kept.push(skill)
    used += cost
  }
  // Keep the original list order for the model; the ranking only chose members.
  const keptIds = new Set(kept.map((skill) => skill.id))
  return {
    skills: input.skills.filter((skill) => keptIds.has(skill.id)),
    omitted: input.skills.length - kept.length,
  }
}
