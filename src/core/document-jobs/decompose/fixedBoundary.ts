import { PREFIX_SYMBOLS } from '../../report-style/text-features'

import { tableCandidates } from './headings'
import { type Block, RULES } from './types'

/** Shared v1/v2 front boundary. Keep the measured v1 page/size policy. */
export function fixedBoundary(blocks: Block[], truncated: boolean) {
  const tables = tableCandidates(blocks)
  const symbols = new Set<string>(PREFIX_SYMBOLS)
  const trigger = blocks.find(
    (b) =>
      (b.prefix && symbols.has(b.prefix)) ||
      tables.some((t) => t.block === b && t.numbered),
  )
  let start = trigger ? blocks.findIndex((b) => b.page === trigger.page) : 0
  const frontPages = new Set(blocks.slice(0, start).map((b) => b.page))
  const sizeOK =
    frontPages.size <= RULES.frontPages &&
    [...frontPages].every(
      (page) =>
        blocks
          .filter((b) => b.page === page)
          .reduce(
            (sum, b) =>
              sum +
              [...b.text.trim()].length +
              b.cells.reduce((s, c) => s + [...c.text.trim()].length, 0),
            0,
          ) <= RULES.frontPageCharacters,
    )
  if (!sizeOK || truncated) start = 0
  return { start, trigger, sizeOK }
}
