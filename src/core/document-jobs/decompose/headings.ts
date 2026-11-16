import type { Block, Fact } from './types'
import { RULES } from './types'

export type TableHeading = {
  block: Block
  titleRef: string
  text: string
  numbered: boolean
  role?: string
}
export function tableCandidates(blocks: Block[]): TableHeading[] {
  return blocks.flatMap((block) => {
    const filled = block.cells.filter((c) => c.codePoints > 0)
    const title = filled.filter((c) => !c.counter)
    if (
      !block.table ||
      !block.table.signature ||
      title.length !== 1 ||
      title[0].paragraphs !== 1 ||
      [...title[0].text.trim()].length > RULES.headingLength
    )
      return []
    return [
      {
        block,
        titleRef: title[0].paragraphRefs[0],
        text: title[0].text.trim(),
        numbered: filled.some((c) => c.counter),
      },
    ]
  })
}
export function headingLevels(
  candidates: TableHeading[],
  firstPage: number,
  facts: Fact[],
): TableHeading[] {
  const groups = new Map<string, TableHeading[]>()
  for (const c of candidates) {
    const key = c.block.table?.signature ?? ''
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const all = [...groups.values()]
  const unnumbered = all.filter((g) => g.every((c) => !c.numbered))
  let level = 1
  if (
    unnumbered.length === 1 &&
    unnumbered[0].length === 1 &&
    unnumbered[0][0] === candidates[0] &&
    candidates[0].block.page === firstPage
  ) {
    candidates[0].role = 'H1'
    level++
  }
  for (const g of all) {
    if (g.every((c) => c.numbered) && g.length >= RULES.numberedOccurrences) {
      for (const c of g) c.role = `H${level}`
      level++
    }
    facts.push({
      step: 5,
      rule: g[0].role
        ? 'table_heading_signature'
        : 'unclassified_heading_table',
      refs: g.map((c) => c.block.table?.ref ?? c.block.ref),
      value: g[0].role ?? 'data_table',
    })
  }
  return candidates
}
