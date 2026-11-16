import { L } from '../../i18n/modelText'

import type { StyleSnapshot } from './types'

/** The most common leading sequence of a group and the first paragraph that has it. */
export type SpacerTypical = { heightsPt: number[]; ref: string; count: number }

/** One class of top-level text paragraphs: same snapshot prefix token (null = plain). */
export type SpacerClass = {
  prefix: string | null
  paragraphs: number
  /** Heights (pt, top to bottom, joined by ',') of the empty paragraphs directly above → count. */
  leading: Record<string, number>
  typical: SpacerTypical | null
  /**
   * By the top-level item before it: '' plain paragraph, a prefix token,
   * 'start', 'table' or 'object' (picture or other unsupported object).
   */
  byPrevious: Record<
    string,
    {
      paragraphs: number
      leading: Record<string, number>
      typical: SpacerTypical | null
    }
  >
}

export type SpacerSummary = {
  /** Top-level paragraphs outside tables; paragraphs holding a table or picture excluded. */
  topLevelParagraphs: number
  emptyParagraphs: number
  /** Font size (pt) of each empty paragraph's first run → count. */
  emptyParagraphHeightsPt: Record<string, number>
  /** Paragraph styles with a non-zero space-before or space-after. */
  paragraphStylesWithSpacing: number
  byPrefix: SpacerClass[]
  note: string
}

const MAX_CLASSES = 12
const MAX_PREVIOUS = 8

type Group = {
  paragraphs: number
  leading: Record<string, number>
  first: Map<string, string>
}

function heightOf(
  snapshot: StyleSnapshot,
  paragraph: StyleSnapshot['paragraphs'][number],
): string {
  const style = (snapshot.characterStyles ?? [])[
    paragraph.runs?.[0]?.characterStyle ?? -1
  ]
  return style?.sizePt.state === 'measured' ? String(style.sizePt.value) : '?'
}

function count(group: Group, sequence: string, ref: string): void {
  group.paragraphs++
  group.leading[sequence] = (group.leading[sequence] ?? 0) + 1
  if (!group.first.has(sequence)) group.first.set(sequence, ref)
}

/** Most common sequence; on a tie a non-empty one, then the earlier one. */
function typicalOf(group: Group): SpacerTypical | null {
  const entries = Object.entries(group.leading)
  if (!entries.length) return null
  const [sequence, times] = entries.reduce((best, item) =>
    item[1] > best[1] || (item[1] === best[1] && !best[0] && item[0])
      ? item
      : best,
  )
  const ref = group.first.get(sequence)
  return ref
    ? {
        heightsPt: sequence
          ? sequence.split(',').map((h) => (h === '?' ? NaN : Number(h)))
          : [],
        ref,
        count: times,
      }
    : null
}

const newGroup = (): Group => ({ paragraphs: 0, leading: {}, first: new Map() })

/**
 * How the sample makes vertical space, per role and context. Korean reports
 * space paragraphs with empty paragraphs of a tuned font size (3pt, 6pt,
 * 10pt…) while every paragraph style keeps zero margins; the height follows
 * the paragraph's own kind (numbered heading 12pt, □ 10pt, ㅇ 8pt, note 3pt in
 * the 2026-11-03 sample) and sometimes the item before it. Measured facts
 * only: the snapshot's prefix token classifies paragraphs, the empty
 * paragraphs directly above each one are its leading sequence.
 */
export function spacerClasses(snapshot: StyleSnapshot): {
  classes: SpacerClass[]
  topLevelParagraphs: number
  emptyParagraphs: number
  emptyParagraphHeightsPt: Record<string, number>
} {
  const nodes = snapshot.nodes ?? []
  const byRef = new Map((snapshot.paragraphs ?? []).map((p) => [p.ref, p]))
  // Paragraphs holding a table or an unsupported object (picture, shape) have
  // no text either, but they are content, not spacing.
  const tables = new Set(
    nodes
      .filter((node) => node.kind === 'table' && node.parentRef)
      .map((node) => node.parentRef),
  )
  const objects = new Set(
    (snapshot.unsupported ?? []).flatMap((item) => item.refs),
  )
  const ordered = nodes
    .filter((node) => node.kind === 'paragraph' && node.parentRef === null)
    .sort((a, b) => (a.topLevelOrder ?? 0) - (b.topLevelOrder ?? 0))
  const classes = new Map<
    string | null,
    Group & { byPrevious: Map<string, Group> }
  >()
  const emptyParagraphHeightsPt: Record<string, number> = {}
  let pending: string[] = []
  let previous = 'start'
  let topLevelParagraphs = 0
  let emptyParagraphs = 0
  for (const node of ordered) {
    if (tables.has(node.ref) || objects.has(node.ref)) {
      pending = []
      previous = tables.has(node.ref) ? 'table' : 'object'
      continue
    }
    const paragraph = byRef.get(node.ref)
    if (!paragraph) continue
    topLevelParagraphs++
    if (paragraph.textCodePoints === 0) {
      const height = heightOf(snapshot, paragraph)
      emptyParagraphs++
      emptyParagraphHeightsPt[height] =
        (emptyParagraphHeightsPt[height] ?? 0) + 1
      pending.push(height)
      continue
    }
    const prefix = paragraph.prefix ?? null
    let cls = classes.get(prefix)
    if (!cls)
      classes.set(prefix, (cls = { ...newGroup(), byPrevious: new Map() }))
    const sequence = pending.join(',')
    count(cls, sequence, node.ref)
    let context = cls.byPrevious.get(previous)
    if (!context) cls.byPrevious.set(previous, (context = newGroup()))
    count(context, sequence, node.ref)
    pending = []
    previous = prefix ?? ''
  }
  const result = [...classes.entries()]
    .sort(([, a], [, b]) => b.paragraphs - a.paragraphs)
    .slice(0, MAX_CLASSES)
    .map(([prefix, cls]) => ({
      prefix,
      paragraphs: cls.paragraphs,
      leading: cls.leading,
      typical: typicalOf(cls),
      byPrevious: Object.fromEntries(
        [...cls.byPrevious]
          .sort(([, a], [, b]) => b.paragraphs - a.paragraphs)
          .slice(0, MAX_PREVIOUS)
          .map(([key, group]) => [
            key,
            {
              paragraphs: group.paragraphs,
              leading: group.leading,
              typical: typicalOf(group),
            },
          ]),
      ),
    }))
  return {
    classes: result,
    topLevelParagraphs,
    emptyParagraphs,
    emptyParagraphHeightsPt,
  }
}

export function spacerSummary(snapshot: StyleSnapshot): SpacerSummary {
  const { classes, ...counts } = spacerClasses(snapshot)
  const measuredNonZero = (atom: { state: string; value?: number }) =>
    atom.state === 'measured' && atom.value !== 0
  return {
    ...counts,
    paragraphStylesWithSpacing: (snapshot.paragraphStyles ?? []).filter(
      (style) =>
        measuredNonZero(style.beforePt) || measuredNonZero(style.afterPt),
    ).length,
    byPrefix: classes,
    note: counts.emptyParagraphs
      ? L({
          ko: '빈 문단은 문단 사이 세로 여백이며 높이는 문단의 역할(접두 기호·번호)과 때로 앞 항목에 따른다. 파생 템플릿은 바인딩마다 대표 문단 바로 위의 빈 문단을 그 역할의 규칙에 넣고, SPACE:<역할>:<앞 항목> 바인딩은 그 문맥에서만 다른 빈 문단을 쓴다. 역할별 typical.ref와 byPrevious의 typical.ref가 그 대표 문단이다.',
          en: 'Empty paragraphs provide vertical spacing between paragraphs; their height depends on the paragraph role (prefix symbol or number) and sometimes the preceding item. For each binding, the derived template puts the empty paragraphs directly above the representative paragraph into that role’s rule; SPACE:<role>:<previous item> bindings use different empty paragraphs only in that context. Each role’s typical.ref and the typical.ref in byPrevious identify these representative paragraphs.',
        })
      : L({
          ko: '빈 문단이 없어 문단 간격은 문단 모양의 앞뒤 여백에서 온다.',
          en: 'There are no empty paragraphs; paragraph spacing comes from the before/after spacing in paragraph styles.',
        }),
  }
}
