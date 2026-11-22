import type { CensusQueryReport, CensusReport } from '../../core/census/types'
import { t } from '../../i18n'

export type CensusRow = CensusQueryReport['rows'][number]
export type CensusSort = 'order' | 'date' | 'note'

export function censusSampleHeader(report: CensusReport): string {
  return t('census.sample', {
    calls: report.sample
      .map((s) =>
        t(s.shown === 0 ? 'census.zero' : 'census.call', {
          call: s.call,
          count: s.shown,
        }),
      )
      .join(', '),
  })
}

export function censusQueryHeader(q: CensusQueryReport): string {
  const prefix = t(`census.${q.mode}`, { query: q.query })
  const c = q.coverage
  if (c.invalidated || !['complete', 'host_partial'].includes(q.status))
    return `${prefix} · ${t(`census.${c.invalidated ? 'invalidated' : q.status}`)}`
  const parts = [prefix]
  const delivered = c.mode === 'lines' ? c.linesDelivered : c.notesDelivered
  if (!c.deliveryComplete)
    parts.push(
      t('census.stopped', {
        pages: Number(c.replayCursor.split('.').at(-1)) + 1,
        count: delivered,
      }),
    )
  if (q.status === 'host_partial')
    parts.push(
      t('census.host_partial', {
        total: c.notesTotal,
        scanned: Math.max(0, q.scanned - q.skipped),
        remaining: q.remaining,
      }),
    )
  else {
    parts.push(
      q.skipped
        ? t('census.skipped', {
            total: c.notesTotal,
            scanned: Math.max(0, q.scanned - q.skipped),
            skipped: q.skipped,
          })
        : t(c.deliveryComplete ? 'census.complete' : 'census.hostComplete', {
            count: q.scanned,
          }),
    )
    // The stored row cap does not change the known match count.
    if (
      q.mode === 'lines' &&
      (q.matchedNotes !== undefined || q.rowsStoredOmitted === 0)
    )
      parts.push(
        t('census.noteMatches', {
          count: q.matchedNotes ?? new Set(q.rows.map((row) => row.path)).size,
        }),
      )
    parts.push(
      t(q.mode === 'lines' ? 'census.lineMatches' : 'census.noteMatches', {
        count: q.rows.length + q.rowsStoredOmitted,
      }),
    )
  }
  parts.push(t('census.returned', { count: delivered }))
  return parts.join(' · ')
}

export function censusColumns(q: CensusQueryReport): string[] {
  return [
    'note',
    'date',
    'location',
    q.mode === 'lines' ? 'content' : 'preview',
    'return',
  ].map((key) => t(`census.${key}`))
}
export function censusCells(row: CensusRow): string[] {
  return [
    row.path,
    row.date || '—',
    row.line === null
      ? t('census.outside')
      : [
          t('census.line', { line: row.line }),
          'heading' in row ? row.heading : '',
        ]
          .filter(Boolean)
          .join(' · '),
    row.preview + (row.truncated ? '…' : ''),
    t(`census.${row.returned}`),
  ]
}
export function sortedCensusRows(
  q: CensusQueryReport,
  sort: CensusSort,
): CensusRow[] {
  return sort === 'order'
    ? q.rows
    : [...q.rows].sort(
        (a, b) =>
          (sort === 'date'
            ? a.date.localeCompare(b.date)
            : a.path.localeCompare(b.path)) ||
          a.path.localeCompare(b.path) ||
          (a.line ?? 0) - (b.line ?? 0),
      )
}
export function censusFootnotes(q: CensusQueryReport): string[] {
  return [
    ...(q.skipped
      ? [t('census.skippedFiles', { count: q.skipped }), ...q.skippedPaths]
      : []),
    ...(q.skippedPathsOmitted
      ? [t('census.omittedPaths', { count: q.skippedPathsOmitted })]
      : []),
    ...(q.rowsStoredOmitted
      ? [t('census.storedOmitted', { count: q.rowsStoredOmitted })]
      : []),
    ...(!['complete', 'host_partial'].includes(q.status)
      ? [t(`census.${q.status}`)]
      : []),
  ]
}
const cell = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/\r?\n/g, '<br>')
export function censusMarkdown(report: CensusReport): string {
  return [
    t('census.explanation'),
    ...(report.sample.length ? [censusSampleHeader(report)] : []),
    ...report.queries.map((q) =>
      [
        censusQueryHeader(q),
        t('census.literal'),
        [
          `| ${censusColumns(q).map(cell).join(' | ')} |`,
          '| --- | --- | --- | --- | --- |',
          ...q.rows.map(
            (row) => `| ${censusCells(row).map(cell).join(' | ')} |`,
          ),
        ].join('\n'),
        ...censusFootnotes(q).map(cell),
      ].join('\n\n'),
    ),
  ].join('\n\n')
}
