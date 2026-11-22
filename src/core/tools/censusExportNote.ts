import { t } from '../../i18n'
import { censusQueryHeader } from '../../utils/chat/censusPresentation'
import type { CensusScanResult } from '../census/CensusScan'
import type { CensusQueryReport } from '../census/types'

const cell = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')

/** Full rescan rows only; the stored report's capped rows are never inputs. */
export function renderCensusExportNote(
  query: CensusQueryReport,
  rows: CensusScanResult['rows'],
  now: Date,
) {
  const columns = [
    'note',
    'date',
    'lineNumber',
    ...(query.mode === 'lines' ? ['heading', 'content'] : ['preview']),
  ]
  return [
    `# ${cell(query.query)}`,
    '',
    censusQueryHeader(query),
    '',
    t('census.literal'),
    '',
    `| ${columns.map((key) => t(`census.${key}`)).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map(
      (row) =>
        `| ${[
          `[[${row.path.replace(/\.md$/i, '')}]]`,
          row.date,
          row.line ?? t('census.outside'),
          ...('heading' in row ? [row.heading, row.preview] : [row.preview]),
        ]
          .map(cell)
          .join(' | ')} |`,
    ),
    '',
    t('census.skippedFiles', { count: query.skipped }),
    ...query.skippedPaths.map((p) => `- ${cell(p)}`),
    '',
    t('census.exportedAt', { time: now.toISOString() }),
    '',
  ].join('\n')
}
