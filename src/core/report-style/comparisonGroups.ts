import { representativeRun } from './representativeRun'
import type { Atom, StyleSnapshot } from './types'

export function comparisonGroups(
  snapshot: StyleSnapshot,
  dominant: boolean,
  atoms: (value: unknown) => [string, Atom<unknown>][],
) {
  const groups = new Map<
    string,
    { count: number; values: Map<string, Atom<unknown>> }
  >()
  for (const paragraph of snapshot.paragraphs) {
    const char = representativeRun(paragraph, dominant)?.characterStyle
    const key = `${paragraph.paragraphStyle}/${char ?? 'none'}`
    const group = groups.get(key)
    if (group) group.count++
    else
      groups.set(key, {
        count: 1,
        values: new Map(
          atoms({
            paragraph: snapshot.paragraphStyles[paragraph.paragraphStyle],
            character:
              char === undefined ? null : snapshot.characterStyles[char],
          }),
        ),
      })
  }
  return groups
}

export function representativeStyle(
  snapshot: StyleSnapshot,
  ref: string,
  marker?: string,
) {
  const paragraph = snapshot.paragraphs.find((item) => item.ref === ref)
  if (!paragraph) throw new Error('Unknown output representative reference.')
  const run = representativeRun(paragraph, marker === 'BODY:META')
  return {
    paragraph: snapshot.paragraphStyles[paragraph.paragraphStyle],
    character: run ? snapshot.characterStyles[run.characterStyle] : null,
  }
}
