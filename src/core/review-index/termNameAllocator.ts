import { sha256Hex } from '../../utils/hash'
import { safeWikiName } from '../tools/treatyWiki'

export async function assignUniqueTermNames(
  terms: { term: string }[],
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>()
  const occupied = new Set<string>()

  const canonical = (x: string) => x.normalize('NFC').toLowerCase()

  const RESERVED_NAMES = new Set([
    'con',
    'prn',
    'aux',
    'nul',
    'com1',
    'com2',
    'com3',
    'com4',
    'com5',
    'com6',
    'com7',
    'com8',
    'com9',
    'lpt1',
    'lpt2',
    'lpt3',
    'lpt4',
    'lpt5',
    'lpt6',
    'lpt7',
    'lpt8',
    'lpt9',
  ])

  for (const term of terms) {
    if (mapping.has(term.term)) {
      continue
    }

    let base = safeWikiName(term.term)
    const hash = await sha256Hex(term.term)
    const h = hash.slice(0, 6)

    const suffix = (cnt?: number) =>
      cnt === undefined ? `--${h}` : `--${h}-${cnt}`
    const fit = (b: string, sfx: string) => {
      const sliceLen = 120 - sfx.length
      return b.slice(0, sliceLen).trimEnd() + sfx
    }

    if (base === '') {
      base = 'term'
    }

    const firstSegment = base.split('.')[0]
    const isReserved = RESERVED_NAMES.has(canonical(firstSegment))
    if (isReserved) {
      base = 'term-' + base
    }

    let finalName = base
    let finalCanonical = canonical(finalName)

    if (occupied.has(finalCanonical) || finalName === 'term' || isReserved) {
      let cnt = 1
      let foundUnique = false
      while (!foundUnique) {
        const sfx = cnt === 1 ? suffix() : suffix(cnt)
        const proposed = fit(base, sfx)
        const proposedCanonical = canonical(proposed)

        const proposedFirstSegment = proposed.split('.')[0]
        if (
          !occupied.has(proposedCanonical) &&
          !RESERVED_NAMES.has(canonical(proposedFirstSegment))
        ) {
          finalName = proposed
          finalCanonical = proposedCanonical
          foundUnique = true
        } else {
          cnt++
        }
      }
    }

    mapping.set(term.term, finalName)
    occupied.add(finalCanonical)
  }

  return mapping
}
