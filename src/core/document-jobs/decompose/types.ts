import type { BindingCandidate } from '../../report-style/bindingCandidates'
import type { SemanticResult } from '../../report-style/semanticRead'
import type { Binding, StyleSnapshot } from '../../report-style/types'

export const RULES = Object.freeze({
  version: 'decompose-structure/1',
  headingLength: 60,
  numberedOccurrences: 2,
  frontPages: 3,
  frontPageCharacters: 400,
  titleContinuations: 2,
  contextOccurrences: 2,
  baseFontPt: 15,
  maxHeadingLevel: 6,
  textBytes: 512 * 1024,
  bindings: 24,
  ranges: 4,
  replacements: 16,
  bundleBytes: 64 * 1024,
  variantMinParagraphs: 2,
})
export class DecomposeError extends Error {
  constructor(
    readonly code: string,
    readonly refs: string[] = [],
  ) {
    super(`Decomposition: ${code}`)
  }
}
export type StructureCell = {
  ref: string
  row: number
  col: number
  rowSpan: number
  colSpan: number
  paragraphs: number
  codePoints: number
  counter: boolean
}
export type StructureBlock = {
  ref: string
  kind: 'paragraph' | 'table_host'
  pageBreak: boolean
  columnBreak: boolean
  controls: {
    kind: string
    ownerRef: string
    attributes: Record<string, string>
  }[]
  objects: {
    ref: string
    kind: 'pic' | 'tbl'
    treatAsChar: boolean
    assetSha256?: string
  }[]
  table?: {
    ref: string
    rows: number
    cols: number
    signature: string
    cells: StructureCell[]
  }
}
export type DeriveStructure = {
  schema: 'derive-structure/1'
  sample_sha256: string
  structure_sha256: string
  section_count: number
  blocks: StructureBlock[]
  truncated: boolean
  omitted_blocks: number
}
export type Block = StructureBlock & {
  page: number
  text: string
  prefix: string | null
  semanticRole: string | null
  cells: (StructureCell & { text: string; paragraphRefs: string[] })[]
}
export type Fact = {
  step: number
  rule: string
  refs: string[]
  value?: unknown
}
export type Replacement = {
  paragraphRef: string
  metaKey: string
  format?: string
}
export type FixedRange = {
  position: 'before_content' | 'after_content'
  from_ref: string
  to_ref: string
  replacements: Replacement[]
}
export type Projection = Block & {
  role: string
  headingText?: string
  representativeRef?: string
  omittedObjects: { ref: string; kind: string }[]
}
export type Model = {
  blocks: Projection[]
  fixedBlocks: Block[]
  facts: Fact[]
  bodyStart: string | null
  body_source: string | null
  bodyNeedsChoice: boolean
  bodyCandidates: BindingCandidate[]
  roles_dropped: { marker: string; ref: string; reason: string }[]
  semantic_unavailable: string | null
  bindings: Binding[]
  fixedRegions: FixedRange[]
  meta: Record<string, string>
  unclassified: string[]
  omitted: string[]
}
export type ModelInput = {
  snapshot: StyleSnapshot
  texts: Record<string, string>
  semantic: Pick<SemanticResult, 'nodes'>
  semanticUnavailable?: string | null
  structure: DeriveStructure
  baseFontPt?: number
}
