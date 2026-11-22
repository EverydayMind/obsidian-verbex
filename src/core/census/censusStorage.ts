import { compactCensusMetadata } from './censusMetadataBudget'
import type { CensusReport } from './types'

export const CENSUS_STORAGE_LIMITS = {
  queryRows: 2000,
  queryBytes: 512 * 1024,
  turnBytes: 2 * 1024 * 1024,
  skippedPaths: 100,
}
export const censusBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length

/** Reserve all query metadata before assigning the turn's shared row budget. */
export function boundCensusRows(report: CensusReport): void {
  const rows = report.queries.map((query) => query.rows)
  for (const query of report.queries) {
    query.rowsStoredOmitted += query.rows.length
    query.rows = []
    if (censusBytes(query) > CENSUS_STORAGE_LIMITS.queryBytes - 64)
      compactCensusMetadata(query)
  }
  if (censusBytes(report) > CENSUS_STORAGE_LIMITS.turnBytes - 64)
    for (const query of report.queries) compactCensusMetadata(query)
  // Reserve growth of counters and array separators too, not just preview bytes.
  let remaining = CENSUS_STORAGE_LIMITS.turnBytes - censusBytes(report) - 64
  for (const [index, query] of report.queries.entries()) {
    if (query.status === 'unavailable') continue
    let available = Math.min(
      remaining,
      CENSUS_STORAGE_LIMITS.queryBytes - censusBytes(query) - 64,
    )
    for (const row of rows[index]) {
      const bytes = censusBytes(row) + 1
      if (
        query.rows.length >= CENSUS_STORAGE_LIMITS.queryRows ||
        bytes > available
      )
        break
      query.rows.push(row)
      query.rowsStoredOmitted--
      remaining -= bytes
      available -= bytes
    }
  }
}
