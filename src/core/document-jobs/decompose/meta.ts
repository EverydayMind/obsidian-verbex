import type { StyleSnapshot } from '../../report-style/types'

import { characterShape } from './bodyRoles'
import { type Block, RULES, type Replacement } from './types'

export function dateValue(
  text: string,
): { value: string; format: string } | null {
  const m = text
    .trim()
    .match(
      /^(\d{4})([.\-/]|년)(\s*)(\d{1,2})([.\-/]|월)(\s*)(\d{1,2})([.일]?)$/u,
    )
  if (!m) return null
  const [, y, sep1, s1, month, sep2, s2, day, end] = m
  const value = `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(value))
    return null
  return {
    value,
    format: `YYYY${sep1}${s1}${month.startsWith('0') ? 'MM' : 'M'}${sep2}${s2}${day.startsWith('0') ? 'DD' : 'D'}${end}`,
  }
}
export function fixedMeta(
  snapshot: StyleSnapshot,
  fixed: Block[],
  texts: Record<string, string>,
  semantic: Map<string, string>,
) {
  const meta: Record<string, string> = {}
  const replacements: Replacement[] = []
  const nodes = new Map(snapshot.nodes.map((n) => [n.ref, n]))
  const fixedRoots = new Set(fixed.map((b) => b.ref))
  const paragraphs = snapshot.paragraphs.filter((p) => {
    let n = nodes.get(p.ref)
    while (n?.parentRef) n = nodes.get(n.parentRef)
    return !!n && fixedRoots.has(n.ref)
  })
  for (const [i, p] of paragraphs.entries()) {
    const date = dateValue(texts[p.ref])
    const root = fixed.find(
      (b) =>
        b.ref === p.ref || b.cells.some((c) => c.paragraphRefs.includes(p.ref)),
    )
    if (date && !meta.date && root?.page === 0) {
      meta.date = date.value
      replacements.push({
        paragraphRef: p.ref,
        metaKey: 'date',
        format: date.format,
      })
    }
    if (semantic.get(p.ref) !== 'DOCUMENT_TITLE' || meta.title) continue
    for (let j = 0; j <= RULES.titleContinuations; j++) {
      const next = paragraphs[i + j]
      if (
        !next ||
        (j > 0 && dateValue(texts[next.ref])) ||
        nodes.get(next.ref)?.parentRef !== nodes.get(p.ref)?.parentRef ||
        characterShape(snapshot, next.ref) !==
          characterShape(snapshot, p.ref) ||
        !texts[next.ref].trim()
      )
        break
      const key = j ? `title_${j + 1}` : 'title'
      meta[key] = texts[next.ref].trim()
      replacements.push({ paragraphRef: next.ref, metaKey: key })
    }
  }
  return { meta, replacements }
}
