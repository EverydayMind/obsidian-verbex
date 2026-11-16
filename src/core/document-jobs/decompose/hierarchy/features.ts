import type { Atom, StyleSnapshot } from '../../../report-style/types'
import { HIERARCHY_RULES_VERSION } from '../dialectV2'
import type { Block } from '../types'

import { visibleText } from './markers'

export const HIERARCHY_RULES = Object.freeze({
  version: HIERARCHY_RULES_VERSION,
  smallerPt: 1,
  indentPt: 2,
  sectionMinPt: 15,
  sans: /고딕|돋움|굴림|헤드라인|Gothic|Sans|Malgun|Dotum|Gulim/i,
  serif: /명조|바탕|궁서|Batang|Myeongjo|Serif|Gungsuh/i,
})
export const measured = <T>(atom: Atom<T> | undefined): T | null =>
  atom?.state === 'measured' ? atom.value : null
export type FaceClass = 'sans' | 'serif' | null
export type TextRun = {
  text: string
  sizePt: number | null
  font: string | null
  bold: boolean | null
  italic: boolean | null
}
export type HierarchyFeature = {
  ref: string
  text: string
  sizePt: number | null
  faceClass: FaceClass
  leftPt: number | null
  outlineLevel: number | null
  box1x1: boolean
  titleCandidate: boolean
  object?: 'table' | 'picture'
  runs?: TextRun[]
  sourceRef?: string
  styleShape?: string
}
export function measureRuns(runs: TextRun[]) {
  const sizes = new Map<number | null, number>()
  const longest = new Map<number | null, TextRun>()
  const ignoredWhitespaceRuns: number[] = []
  runs.forEach((r, i) => {
    if (!r.text.trim()) {
      ignoredWhitespaceRuns.push(i)
      return
    }
    sizes.set(r.sizePt, (sizes.get(r.sizePt) ?? 0) + [...r.text].length)
    if ([...r.text].length > [...(longest.get(r.sizePt)?.text ?? '')].length)
      longest.set(r.sizePt, r)
  })
  const sizePt = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const font = longest.get(sizePt)?.font ?? null
  const faceClass: FaceClass =
    font && HIERARCHY_RULES.sans.test(font)
      ? 'sans'
      : font && HIERARCHY_RULES.serif.test(font)
        ? 'serif'
        : null
  return { sizePt, faceClass, font, ignoredWhitespaceRuns }
}
export function extractFeature(
  snapshot: StyleSnapshot,
  block: Block,
  titleRef?: string,
): HierarchyFeature {
  const sourceRef = titleRef ?? block.ref
  const p = snapshot.paragraphs.find((p) => p.ref === sourceRef)
  const text = titleRef
    ? (block.cells.find((c) => c.paragraphRefs.includes(titleRef))?.text ?? '')
    : block.text
  const chars = [...text]
  const runs = (p?.runs ?? []).map((r): TextRun => {
    const s = snapshot.characterStyles[r.characterStyle]
    return {
      text: chars.slice(r.start, r.start + r.length).join(''),
      sizePt: measured(s?.sizePt),
      font: measured(s?.fonts.hangul),
      bold: measured(s?.bold),
      italic: measured(s?.italic),
    }
  })
  const para = snapshot.paragraphStyles[p?.paragraphStyle ?? -1]
  const measuredRuns = measureRuns(runs)
  return {
    ref: block.ref,
    sourceRef,
    text: visibleText(text, p?.prefix ?? null),
    ...measuredRuns,
    leftPt: measured(para?.leftPt),
    outlineLevel: measured(para?.outlineLevel),
    box1x1: block.table?.rows === 1 && block.table.cols === 1,
    titleCandidate: false,
    runs,
    styleShape: JSON.stringify([measuredRuns.sizePt, measuredRuns.font]),
  }
}
