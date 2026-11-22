export const census = {
  export: 'Export to note',
  exportBusy: 'Cannot export while running',
  askAgain: 'Please ask again',
  lineNumber: 'Line number',
  heading: 'Heading',
  exportedAt: 'Exported at: {time}',
  checking: 'Checking the remaining results…',
  lines: 'Census (body lines) “{query}”',
  notes: 'Census (notes) “{query}”',
  complete: 'Checked all {count} eligible notes',
  stopped:
    'The model received {pages} result pages ({count} items) and stopped continuing',
  hostComplete: 'The host independently checked to the end',
  skipped:
    'Checked {scanned} of {total} notes; {skipped} could not be checked due to size limits or read failures (matches within them are unknown)',
  host_partial:
    'Host checking reached a time or resource limit: checked {scanned} of {total} notes (matches in the remaining {remaining} notes are unknown)',
  invalidated:
    'Target notes changed during checking; results were not combined',
  expired:
    'The query record expired; no table could be made (please ask again)',
  evicted:
    'The query record was evicted from memory; no table could be made (please ask again)',
  unavailable:
    'The query record is unavailable; no table could be made (please ask again)',
  lineMatches: '{count} matching lines',
  noteMatches: '{count} matching notes',
  returned: '{count} items returned in tool results',
  sample: 'Search: relevance-selected candidates — {calls} (not a census)',
  call: 'Call {call}: {count} candidates',
  zero: 'Call {call}: 0 candidates',
  literal:
    'These results match literal conditions; their meaning has not been checked',
  explanation:
    'The evidence ledger lists source text read to the end; this card lists census query results',
  note: 'Note',
  date: 'Date',
  location: 'Location',
  content: 'Content',
  preview: 'Preview',
  return: 'Returned',
  this_turn: 'This turn',
  earlier: 'Earlier turn',
  no: '—',
  unknown: 'Unknown',
  outside: 'Match outside the body',
  line: 'Line {line}',
  order: 'Tool order',
  sort: 'Sort',
  group: 'Group by note',
  skippedFiles: '{count} skipped files',
  omittedPaths: '{count} paths omitted from the list',
  storedOmitted:
    '{count} rows not stored in the table due to the storage limit',
}
