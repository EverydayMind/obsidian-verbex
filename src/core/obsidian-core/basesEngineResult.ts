import { L } from '../../i18n/modelText'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'

import type { RawViewSnapshot } from './basesEngineView'

export type EvaluatedProperty = {
  id: string
  displayName: string
}

export type EvaluatedRow = {
  path: string
  values: string[]
}

export type EvaluatedGroup = {
  key: string | null
  rowIndexes: number[]
}

export type EvaluatedView = {
  name: string
  properties: EvaluatedProperty[]
  rows: EvaluatedRow[]
  groups: EvaluatedGroup[]
  hasGroupBy: boolean
  privateExcluded: number
  limitApplied?: number
}

export function buildEvaluatedView(
  name: string,
  snapshot: RawViewSnapshot,
  hasGroupByConfig: boolean,
  limit?: number,
): EvaluatedView {
  const hasGroupBy = hasGroupByConfig || snapshot.hasGroupByHint
  const rows: EvaluatedRow[] = []
  const groups: EvaluatedGroup[] = []
  let privateExcluded = 0
  let totalPublic = 0

  if (hasGroupBy && snapshot.groups.length > 0) {
    for (const group of snapshot.groups) {
      const publicEntries: EvaluatedRow[] = []
      for (const entry of group.entries) {
        if (isAiPrivatePath(entry.path)) {
          privateExcluded += 1
          continue
        }
        publicEntries.push(entry)
      }
      if (publicEntries.length === 0) continue
      const rowIndexes: number[] = []
      for (const entry of publicEntries) {
        totalPublic += 1
        if (limit !== undefined && rows.length >= limit) continue
        rowIndexes.push(rows.length)
        rows.push(entry)
      }
      if (rowIndexes.length > 0) {
        groups.push({ key: group.key, rowIndexes })
      }
    }
  } else {
    for (const entry of snapshot.entries) {
      if (isAiPrivatePath(entry.path)) {
        privateExcluded += 1
        continue
      }
      totalPublic += 1
      if (limit !== undefined && rows.length >= limit) continue
      rows.push(entry)
    }
    if (rows.length > 0) {
      groups.push({ key: null, rowIndexes: rows.map((_, index) => index) })
    }
  }

  return {
    name,
    properties: snapshot.properties,
    rows,
    groups,
    hasGroupBy,
    privateExcluded,
    ...(limit !== undefined && totalPublic > limit
      ? { limitApplied: limit }
      : {}),
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function renderMarkdownTable(
  headers: readonly string[],
  rows: readonly EvaluatedRow[],
): string[] {
  const lines = [
    `| ${headers.map(escapeCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ]
  for (const row of rows) {
    lines.push(`| ${row.values.map(escapeCell).join(' | ')} |`)
  }
  return lines
}

export function formatEvaluatedViewMarkdown(view: EvaluatedView): string {
  const lines: string[] = [
    `### ${view.name} (${view.rows.length} ${view.rows.length === 1 ? 'entry' : 'entries'})`,
  ]
  if (view.privateExcluded > 0) {
    lines.push(
      L({
        ko: `AI 비공개 ${view.privateExcluded}행 제외`,
        en: `${view.privateExcluded} AI-private row(s) excluded`,
      }),
    )
  }
  lines.push('')
  if (view.rows.length === 0) {
    lines.push(
      L({
        ko: '(조건에 맞는 파일 없음 — 필터·속성 이름을 확인하세요)',
        en: '(No matching files — check filter and property names)',
      }),
    )
    return lines.join('\n')
  }

  const headers = view.properties.map((prop) => prop.displayName)
  if (view.hasGroupBy && view.groups.length > 0) {
    const emptyLabel = L({ ko: '(없음)', en: '(none)' })
    view.groups.forEach((group, index) => {
      if (index > 0) lines.push('')
      const label = group.key ?? emptyLabel
      lines.push(`#### ${label} (${group.rowIndexes.length})`)
      lines.push('')
      const groupRows = group.rowIndexes.map((rowIndex) => view.rows[rowIndex])
      lines.push(...renderMarkdownTable(headers, groupRows))
    })
  } else {
    lines.push(...renderMarkdownTable(headers, view.rows))
  }
  return lines.join('\n')
}

export function formatEvaluatedViewsMarkdown(
  views: readonly EvaluatedView[],
): string {
  return views.map(formatEvaluatedViewMarkdown).join('\n\n')
}
