import { useState } from 'react'

import { useApp } from '../../contexts/app-context'
import type { CensusQueryReport, CensusReport } from '../../core/census/types'
import { t } from '../../i18n'
import type { ToolCallRequest } from '../../types/tool-call.types'
import {
  censusCells,
  censusColumns,
  censusFootnotes,
  censusQueryHeader,
  censusSampleHeader,
  sortedCensusRows,
} from '../../utils/chat/censusPresentation'
import type { CensusRow, CensusSort } from '../../utils/chat/censusPresentation'

type ExportProps = {
  busy?: boolean
  onRunProposals?: (calls: ToolCallRequest[], labels: string[]) => void
}
function QueryTable({
  query,
  busy,
  onRunProposals,
}: { query: CensusQueryReport } & ExportProps) {
  const app = useApp()
  const [sort, setSort] = useState<CensusSort>('order')
  const [group, setGroup] = useState(false)
  const rows = sortedCensusRows(query, sort)
  const table = (items: CensusRow[]) => (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            {censusColumns(query).map((title) => (
              <th key={title}>{title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, index) => (
            <tr key={`${row.path}:${String(row.line)}:${index}`}>
              {censusCells(row).map((value, i) => (
                <td key={i}>
                  {i === 0 ? (
                    <a
                      href={row.path}
                      onClick={(event) => {
                        event.preventDefault()
                        void app.workspace.openLinkText(
                          row.path,
                          '',
                          false,
                          query.mode === 'lines' && row.line !== null
                            ? { eState: { line: row.line - 1 } }
                            : undefined,
                        )
                      }}
                    >
                      {value}
                    </a>
                  ) : i === 3 ? (
                    <span title={value}>
                      {value.length > 240 ? `${value.slice(0, 240)}…` : value}
                    </span>
                  ) : (
                    value
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  const groups = new Map<string, CensusRow[]>()
  for (const row of rows)
    groups.set(row.path, [...(groups.get(row.path) ?? []), row])
  return (
    <details>
      <summary>{censusQueryHeader(query)}</summary>
      <p>{t('census.literal')}</p>
      <label>
        {t('census.sort')}{' '}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as CensusSort)}
        >
          {(['order', 'date', 'note'] as const).map((key) => (
            <option key={key} value={key}>
              {t(`census.${key}`)}
            </option>
          ))}
        </select>
      </label>
      {query.mode === 'lines' && (
        <label>
          <input
            type="checkbox"
            checked={group}
            onChange={(e) => setGroup(e.target.checked)}
          />
          {t('census.group')}
        </label>
      )}
      {group
        ? [...groups].map(([path, items]) => (
            <details key={path}>
              <summary>{path}</summary>
              {table(items)}
            </details>
          ))
        : table(rows)}
      {censusFootnotes(query).map((text, i) => (
        <p key={i}>{text}</p>
      ))}
      <button
        disabled={
          busy === true ||
          query.exportAvailability !== 'available' ||
          !onRunProposals
        }
        onClick={() =>
          onRunProposals?.(
            [
              {
                id: `census-export-${Date.now()}`,
                name: 'export_census_report',
                arguments: JSON.stringify({ sessionRef: query.sessionRef }),
              },
            ],
            [t('census.export')],
          )
        }
      >
        {t('census.export')}
      </button>
      {(busy || query.exportAvailability !== 'available') && (
        <p>
          {busy
            ? t('census.exportBusy')
            : t(`census.${query.exportAvailability}`)}
        </p>
      )}
    </details>
  )
}

export default function CensusReportCard({
  report,
  busy,
  onRunProposals,
}: { report: CensusReport } & ExportProps) {
  return (
    <div className="verbex-census-report">
      <p>{t('census.explanation')}</p>
      <p>{t('census.literal')}</p>
      {report.sample.length > 0 && <p>{censusSampleHeader(report)}</p>}
      {report.queries.map((query) => (
        <QueryTable
          key={query.queryId}
          query={query}
          busy={busy}
          onRunProposals={onRunProposals}
        />
      ))}
    </div>
  )
}
