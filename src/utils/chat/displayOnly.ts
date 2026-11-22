/** Also protects raw request/compaction entry points without the summary flag. */
export function withoutCensusReports<T>(messages: T[]): T[] {
  const filtered = messages.filter(
    (message) =>
      !(
        message &&
        typeof message === 'object' &&
        'verbexCensusReport' in message &&
        message.verbexCensusReport
      ),
  )
  return filtered.length === messages.length ? messages : filtered
}
