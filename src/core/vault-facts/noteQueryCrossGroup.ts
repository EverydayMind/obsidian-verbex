import type { QueryArgs } from './noteQueryArgs'
import * as crossText from './noteQueryCrossGroupText'
import { groupSumFact } from './noteQueryGroupSumText'
import * as noteText from './noteQueryText'
import * as toolsText from './noteQueryToolsText'
import { type Note, values } from './noteQueryValues'

export type CrossGroupPair = {
  first: string
  second: string
  count: number
}

export type CrossGroupResult = {
  pairs: CrossGroupPair[]
  firstTotals: [string, number][]
  pairSum: number
  hasMultiPair: boolean
}

const cut = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s

export function sanitizeCrossLabel(value: string): string {
  return value.replace(/\r\n|[\t\r\n]/g, ' ')
}

export function groupAxisKeys(
  note: Note,
  field: string,
  groupDate?: string,
): string[] {
  const vs = values(note, field).map((v) => v.text)
  const keys = vs.length ? vs : [noteText.noValue()]
  return [
    ...new Set(
      keys.map((v) =>
        groupDate && /^\d{4}-\d{2}-\d{2}/.test(v)
          ? v.slice(
              0,
              groupDate === 'year' ? 4 : groupDate === 'month' ? 7 : 10,
            )
          : v,
      ),
    ),
  ]
}

export function crossGroupNotes(notes: Note[], q: QueryArgs): CrossGroupResult {
  const firstField = q.group_by
  const secondField = q.split_by
  if (!firstField || !secondField)
    return { pairs: [], firstTotals: [], pairSum: 0, hasMultiPair: false }

  const firstMap = new Map<string, number>()
  const pairMap = new Map<string, Map<string, number>>()
  let pairSum = 0
  let hasMultiPair = false

  for (const n of notes) {
    const firsts = groupAxisKeys(n, firstField, q.group_date)
    const seconds = groupAxisKeys(n, secondField, q.group_date)
    if (firsts.length * seconds.length > 1) hasMultiPair = true
    for (const first of firsts) {
      firstMap.set(first, (firstMap.get(first) ?? 0) + 1)
      let inner = pairMap.get(first)
      if (!inner) {
        inner = new Map<string, number>()
        pairMap.set(first, inner)
      }
      for (const second of seconds) {
        inner.set(second, (inner.get(second) ?? 0) + 1)
        pairSum += 1
      }
    }
  }

  const pairs: CrossGroupPair[] = []
  for (const [first, inner] of pairMap) {
    for (const [second, count] of inner) {
      pairs.push({ first, second, count })
    }
  }
  pairs.sort(
    (a, b) =>
      a.first.localeCompare(b.first, 'ko') ||
      b.count - a.count ||
      a.second.localeCompare(b.second, 'ko'),
  )
  const firstTotals = [...firstMap].sort((a, b) =>
    a[0].localeCompare(b[0], 'ko'),
  )
  return { pairs, firstTotals, pairSum, hasMultiPair }
}

function formatFirstTotalsLine(
  firstField: string,
  dateSuffix: string,
  firstTotals: [string, number][],
): string {
  if (!firstTotals.length) return ''
  const parts: string[] = []
  let chars = 0
  for (const [key, count] of firstTotals.slice(0, 50)) {
    const item = `${cut(sanitizeCrossLabel(key), 80)} ${count}`
    if (parts.length && chars + item.length + 3 > 1000) break
    parts.push(item)
    chars += item.length + (parts.length > 1 ? 3 : 0)
  }
  if (parts.length < firstTotals.length)
    parts.push(crossText.moreFirstKeys(firstTotals.length - parts.length))
  return crossText.firstTotalsLine(firstField, dateSuffix, parts.join(' · '))
}

export function formatCrossGroupSection(
  notes: Note[],
  q: QueryArgs,
  precomputed?: CrossGroupResult,
): { text: string; partial: boolean } {
  if (!q.group_by || !q.split_by) return { text: '', partial: false }
  const cross = precomputed ?? crossGroupNotes(notes, q)
  let shown = 0
  let pairText = ''
  for (const pair of cross.pairs.slice(0, 200)) {
    const line = `\n${cut(sanitizeCrossLabel(pair.first), 80)}\t${cut(sanitizeCrossLabel(pair.second), 80)}\t${pair.count}`
    if (pairText.length + line.length > 5900) break
    pairText += line
    shown += 1
  }
  const partial = shown < cross.pairs.length
  const dateSuffix = q.group_date ? `(${q.group_date})` : ''
  const status = partial
    ? crossText.partialPairs(notes.length, cross.pairs.length, shown)
    : crossText.allPairs(notes.length, cross.pairs.length)
  const fact =
    partial || !cross.pairs.length
      ? crossText.genericMultiPair()
      : cross.hasMultiPair
        ? crossText.multiPairSumFact(cross.pairSum, notes.length)
        : groupSumFact(cross.pairSum, notes.length)
  const firstLine = formatFirstTotalsLine(
    q.group_by,
    dateSuffix,
    cross.firstTotals,
  )
  return {
    text: crossText.crossCounts(
      q.group_by,
      q.split_by,
      dateSuffix,
      status,
      fact,
      firstLine,
      pairText,
    ),
    partial,
  }
}

export function formatNoteQueryGroups(
  notes: Note[],
  groups: [string, number][],
  q: QueryArgs,
  crossGroups?: CrossGroupResult,
): { text: string; partial: boolean } {
  if (!q.group_by) return { text: '', partial: false }
  if (q.split_by) return formatCrossGroupSection(notes, q, crossGroups)

  let shown = 0
  let groupText = ''
  for (const [name, count] of groups.slice(0, 200)) {
    const line = `\n${cut(name, 80)}\t${count}`
    if (groupText.length + line.length > 5900) break
    groupText += line
    shown += 1
  }
  const partial = shown < groups.length
  const groupSum =
    partial || !groups.length
      ? undefined
      : groups.reduce((sum, [, count]) => sum + count, 0)
  return {
    text: toolsText.groupCounts(
      q.group_by,
      q.group_date ? `(${q.group_date})` : '',
      partial
        ? toolsText.partialGroups(groups.length, shown)
        : toolsText.allGroups(groups.length),
      groupText,
      groupSum !== undefined ? groupSumFact(groupSum, notes.length) : undefined,
    ),
    partial,
  }
}
