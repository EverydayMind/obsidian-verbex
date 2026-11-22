import type { CensusQueryReport } from './types'

/** If diagnostics alone exceed storage, retain counts and an unavailable table.
 * The original ledger and session inputs are never compacted or changed.
 */
export function compactCensusMetadata(query: CensusQueryReport): void {
  if (query.status === 'complete' || query.status === 'host_partial')
    query.status = 'unavailable'
  query.query = ''
  query.skipped = Math.max(query.skipped, query.coverage.skippedFiles.length)
  query.skippedPaths = []
  query.skippedPathsOmitted = query.skipped
  query.coverage.skippedFiles = []
  if (query.coverage.mode === 'lines') query.coverage.noLineMatch.paths = []
}
