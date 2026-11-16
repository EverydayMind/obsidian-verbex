export type ReadFacts = {
  completeness: 'complete' | 'partial' | 'unsupported' | 'empty'
  total?: number
  returned?: number
  nextOffset?: number
  omittedPaths?: string[]
  sourceTruncated?: boolean
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
  coverage?: import('./propertyQuerySession').QueryCoverage
}
