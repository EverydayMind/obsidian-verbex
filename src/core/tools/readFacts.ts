export type ReadFacts = {
  completeness: 'complete' | 'partial' | 'unsupported' | 'empty'
  total?: number
  returned?: number
  nextOffset?: number
  omittedPaths?: string[]
  sourceTruncated?: boolean
  /** Number of relevance-selected notes actually shown by this call. */
  sample?: { unit: 'notes'; shown: number }
  errorCode?:
    | 'unsupported_syntax'
    | 'not_found'
    | 'budget'
    | 'limit'
    | 'aborted'
    | 'expired'
    | 'invalidated'
    | 'cursor_mismatch'
  /** Host-judged coverage of an exhaustive snapshot query, separate from the page. */
  coverage?:
    | (import('./propertyQuerySession').QueryCoverage & { mode?: 'property' })
    | import('./obsidianQueryLinesFacts').LinesCoverage
    | import('./obsidianQueryNotesFacts').NotesCoverage
}
