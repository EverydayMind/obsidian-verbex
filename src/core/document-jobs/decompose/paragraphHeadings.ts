import { PREFIX_SYMBOLS } from '../../report-style/text-features'
import type { StyleSnapshot } from '../../report-style/types'

import type { TableHeading } from './headings'
import { type Block, type Fact, RULES } from './types'

/** Stage 5 runs before BODY population selection, independent of its result. */
export function paragraphHeadings(
  snapshot: StyleSnapshot,
  blocks: Block[],
  tables: TableHeading[],
  facts: Fact[],
): TableHeading[] {
  const symbols = new Set<string>(PREFIX_SYMBOLS)
  const below = Math.max(
    0,
    ...tables.flatMap((h) => (h.role ? [Number(h.role.slice(1))] : [])),
  )
  const paragraphs = new Map(snapshot.paragraphs.map((p) => [p.ref, p]))
  return blocks.flatMap((block) => {
    if (
      block.table ||
      !block.text.trim() ||
      [...block.text.trim()].length > RULES.headingLength ||
      symbols.has(block.prefix ?? '')
    )
      return []
    const paragraph = paragraphs.get(block.ref)
    const outline =
      snapshot.paragraphStyles[paragraph?.paragraphStyle ?? -1]?.outlineLevel
    const level = outline?.state === 'measured' ? outline.value : 0
    if (level <= 0 && !/^\d+[.)]?$/.test(block.prefix ?? '')) return []
    const role = `H${below + (level > 0 ? level : 1)}`
    facts.push({
      step: 5,
      rule: 'short_outline_below_tables',
      refs: [block.ref],
      value: role,
    })
    return [
      {
        block,
        titleRef: block.ref,
        text: block.text.trim(),
        numbered: false,
        role,
      },
    ]
  })
}
