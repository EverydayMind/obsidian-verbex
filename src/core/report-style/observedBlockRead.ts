import {
  RESULT_LIMITS,
  copyJson,
} from '../../provider/interop/descriptorReader'
import { canonicalDigest } from '../../security/promptInjectionBoundary'

import { validateObservedBlockPage } from './observedBlockSchema'
import { type TextFeatures, validTextFeatureBinding } from './text-features'

export type ObservedMarker = {
  marker: string | null
  markerState: string
  variant: string | null
  variantState: string
}
type Cell = {
  row: number
  col: number
  rowSpan: number
  colSpan: number
  rows: number
  cols: number
  headerRow: boolean
}
type Table = { rows: number; cols: number; headerRows: number; wrapper: string }
type Marker = ObservedMarker
export type ObservedSelection = {
  kind: string
  requestKind:
    | 'explicit'
    | 'implicit_candidates'
    | 'implicit_structure'
    | 'inherited_cell'
  requested: Marker
  applied: Marker
  candidates: Marker[] | null
  cell: Cell | null
  table: Table | null
  prefix: { marker: string | null } | null
  text: {
    state: string
    features?: TextFeatures
    semantics?: {
      prefixOrdinal:
        | { state: 'known'; value: number }
        | { state: 'none' | 'unknown' }
      phrases: {
        scope: 'delimited_only' | 'delimited_and_cell_runs'
        runCoverage?: 'observed' | 'unavailable' | 'not_applicable'
        truncated: boolean
        candidates: Record<string, number>
      }
      scripts?:
        | {
            state: 'observed'
            superscript: number
            subscript: number
            numericSuperscript: number
            truncated: boolean
          }
        | { state: 'unavailable' }
    }
  }
  fallbacks: string[]
  fallbackSource: string
  origin?: 'source' | 'generated'
}
type Selection = ObservedSelection
export type ObservedDraftBlock = {
  index: number
  parentIndex: number | null
  kind: string
  container: string
  depth: number
  headingLevel: number | null
  selection: Selection
  generatedFrom: number | null
  images: {
    requested: number
    pictureReferences: number
    textSubstitutions: number
    omitted: number
    firstOutcome: string
  } | null
  codeLabelSelection: Selection | null
}
type Dependency = { path: string; sha256: string }
type Page = {
  version: string
  state: 'available'
  coverage: 'partial_rendered_structure'
  inputsDigest: string
  conversionIdentity: Record<string, unknown>
  inputDependencies: Dependency[]
  totalBlocks: number
  offset: number
  nextOffset: number | null
  blocks: ObservedDraftBlock[]
}
export type ObservedDraftResult =
  | {
      state: 'available'
      coverage: 'partial_rendered_structure'
      inputsDigest: string
      conversionIdentity: Record<string, unknown>
      inputDependencies: Dependency[]
      blocks: ObservedDraftBlock[]
    }
  | {
      state: 'unavailable' | 'input_changed' | 'block_contract_violation'
      blocks: []
    }

const unavailable = (
  state: 'unavailable' | 'input_changed' | 'block_contract_violation',
): ObservedDraftResult => ({ state, blocks: [] })
const safePath = (path: string) =>
  !/^(?:[A-Za-z]:|\/)/.test(path) &&
  !path.includes('\\') &&
  ![...path].some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  ) &&
  !path.split('/').some((part) => !part || part.startsWith('.'))
const markerPattern =
  /^\{\{(?:H[1-9]|BODY|FIGURE|CAPTION|TABLE_CAPTION|FOOTNOTE|QUOTE(?:_(?:INFO|WARN|SUCCESS|DANGER))?|CALLOUT_(?:NOTE|WARNING|INFO|TIP|SUCCESS|DANGER|TITLE(?:_(?:NOTE|WARNING|INFO|WARN|TIP|SUCCESS|DANGER))?)|CODE|CODE_LANG|HR|LIST_(?:BULLET|ORDERED)_[1-9]\d?|CELL_(?:BODY|NUMBER|STUB|(?:ODD|EVEN)(?:_(?:LEFT|CENTER|RIGHT))?|(?:HEADER|TOP|MIDDLE|BOTTOM)_(?:LEFT|CENTER|RIGHT)))\}\}$/
const prefixPattern =
  /^\{\{ *(?:~)?(?:[□■○●◦ㅇ•※▶▷▪◆◇ㆍ–—―*-]|\d{1,3}\.?)\}\}$/u
const headingPrefixPattern =
  /^\{\{H[1-9]:(?:1(?:\.1)*[.)]?|\(1(?:\.1)*\))(?::(?:keep|strip))?\}\}$/
function validMarker(value: Marker): boolean {
  return (
    (value.markerState === 'observed'
      ? value.marker !== null && markerPattern.test(value.marker)
      : value.marker === null) &&
    (value.variantState === 'observed'
      ? value.variant !== null && /^[\p{L}\p{N}]{1,12}$/u.test(value.variant)
      : value.variant === null)
  )
}
function validSelection(value: Selection, version: string): boolean {
  const order = ['variant_unsupported', 'variant_missing', 'marker_missing']
  const semantic = value.text.semantics
  const ordinal = semantic?.prefixOrdinal
  const prefixClass = value.text.features?.prefixClass
  const max = prefixClass?.startsWith('ARABIC_')
    ? 999
    : prefixClass?.startsWith('KOREAN_') || prefixClass === 'CIRCLED_KOREAN'
      ? 14
      : prefixClass === 'CIRCLED_NUMBER'
        ? 50
        : 3999
  const ordinalValid =
    !semantic ||
    (ordinal?.state === 'known'
      ? !!prefixClass &&
        prefixClass !== 'NONE' &&
        prefixClass !== 'SYMBOL' &&
        ordinal.value <= max &&
        (prefixClass.startsWith('ARABIC_') || ordinal.value >= 1)
      : ordinal?.state === 'none'
        ? prefixClass === 'NONE' || prefixClass === 'SYMBOL'
        : !!prefixClass && prefixClass !== 'NONE' && prefixClass !== 'SYMBOL')
  const phrase = semantic?.phrases
  const phraseValid =
    !phrase ||
    (version === 'observed-block-page/0.2'
      ? phrase.scope === 'delimited_only' &&
        phrase.runCoverage === undefined &&
        phrase.candidates.INLINE_TABLE_HEADER === undefined
      : (version === 'observed-block-page/0.3' ||
          version === 'observed-block-page/0.4') &&
        (value.kind === 'cell_paragraph'
          ? phrase.runCoverage === 'observed' ||
            phrase.runCoverage === 'unavailable'
          : phrase.runCoverage === 'not_applicable') &&
        (phrase.runCoverage === 'observed'
          ? phrase.scope === 'delimited_and_cell_runs'
          : phrase.scope === 'delimited_only') &&
        (phrase.candidates.INLINE_TABLE_HEADER === undefined ||
          (phrase.runCoverage === 'observed' &&
            phrase.candidates.INLINE_TABLE_HEADER === 1 &&
            (phrase.candidates.unknown ?? 0) >= 1)))
  const scripts = semantic?.scripts
  const scriptsValid =
    version === 'observed-block-page/0.4'
      ? !!scripts &&
        (scripts.state === 'unavailable' ||
          (scripts.numericSuperscript <= scripts.superscript &&
            scripts.superscript + scripts.subscript <= 32 &&
            (!scripts.truncated ||
              scripts.superscript + scripts.subscript === 32)))
      : scripts === undefined
  return (
    (value.text.state !== 'observed' ||
      (version === 'observed-block-page/0.1' ? !semantic : !!semantic)) &&
    ordinalValid &&
    phraseValid &&
    (!semantic || scriptsValid) &&
    validMarker(value.requested) &&
    validMarker(value.applied) &&
    (value.candidates === null || value.candidates.every(validMarker)) &&
    (!value.prefix?.marker ||
      prefixPattern.test(value.prefix.marker) ||
      headingPrefixPattern.test(value.prefix.marker)) &&
    value.fallbacks.every(
      (reason, i) =>
        i === 0 ||
        order.indexOf(reason) > order.indexOf(value.fallbacks[i - 1]),
    ) &&
    (value.text.state !== 'observed' ||
      (!!value.text.features &&
        validTextFeatureBinding(
          value.text.features,
          8 * 1024 * 1024,
          !value.text.features.empty,
        )))
  )
}

/** Validate the whole document after all pages: parent and merged-cell checks span pages. */
function validBlocks(blocks: ObservedDraftBlock[], version: string): boolean {
  let gridBudget = 200000
  const selections: Record<string, string[]> = {
    heading: ['heading'],
    paragraph: ['body', 'cell_paragraph', 'quote_paragraph'],
    figure: ['body', 'cell_paragraph', 'quote_paragraph'],
    list_item: ['list_item'],
    table: ['table'],
    table_cell: ['table_cell'],
    caption: ['caption'],
    footnote: ['footnote'],
    quote: ['quote'],
    callout: ['callout'],
    code: ['code'],
    hr: ['hr'],
  }
  const grids = new Map<
    number,
    { occupied: Set<number>; lastRow: number; lastCol: number; table: Table }
  >()
  const ancestors: number[] = []
  for (const [index, block] of blocks.entries()) {
    if (
      block.index !== index ||
      (block.parentIndex !== null && block.parentIndex >= index) ||
      (block.kind === 'heading') !== (block.headingLevel !== null) ||
      !selections[block.kind]?.includes(block.selection.kind) ||
      !validSelection(block.selection, version) ||
      (block.codeLabelSelection !== null &&
        (block.kind !== 'code' ||
          block.codeLabelSelection.kind !== 'body' ||
          !validSelection(block.codeLabelSelection, version)))
    )
      return false
    while (
      ancestors.length &&
      ancestors[ancestors.length - 1] !== block.parentIndex
    )
      ancestors.pop()
    if (block.parentIndex !== null && !ancestors.length) return false
    if (ancestors.length >= 512) return false
    ancestors.push(index)
    const parent = block.parentIndex === null ? null : blocks[block.parentIndex]
    if (parent?.kind === 'table' && block.kind !== 'table_cell') return false
    const table = block.selection.table,
      cell = block.selection.cell
    if (block.kind === 'table') {
      if (
        !table ||
        table.headerRows > table.rows ||
        table.rows * table.cols > gridBudget
      )
        return false
      gridBudget -= table.rows * table.cols
      grids.set(index, { occupied: new Set(), lastRow: -1, lastCol: -1, table })
    } else if (table) return false
    if (block.kind === 'table_cell') {
      if (!cell || !parent || parent.kind !== 'table') return false
      const grid = grids.get(parent.index)
      if (
        !grid ||
        cell.rows !== grid.table.rows ||
        cell.cols !== grid.table.cols ||
        cell.row + cell.rowSpan > cell.rows ||
        cell.col + cell.colSpan > cell.cols ||
        cell.headerRow !== cell.row < grid.table.headerRows ||
        cell.row < grid.lastRow ||
        (cell.row === grid.lastRow && cell.col <= grid.lastCol)
      )
        return false
      grid.lastRow = cell.row
      grid.lastCol = cell.col
      for (let row = cell.row; row < cell.row + cell.rowSpan; row++)
        for (let col = cell.col; col < cell.col + cell.colSpan; col++) {
          const position = row * cell.cols + col
          if (grid.occupied.has(position)) return false
          grid.occupied.add(position)
        }
    }
    if (
      block.generatedFrom !== null &&
      (block.kind !== 'caption' ||
        block.generatedFrom !== index - 1 ||
        blocks[block.generatedFrom]?.kind !== 'figure' ||
        blocks[block.generatedFrom].parentIndex !== block.parentIndex)
    )
      return false
    if (block.images) {
      const image = block.images
      if (
        image.requested !==
          image.pictureReferences + image.textSubstitutions + image.omitted ||
        (image.firstOutcome === 'picture_reference' &&
          !image.pictureReferences) ||
        (image.firstOutcome === 'text_substitution' &&
          !image.textSubstitutions) ||
        (image.firstOutcome === 'omitted' && !image.omitted)
      )
        return false
    }
  }
  return [...grids.values()].every(
    ({ occupied, table }) => occupied.size === table.rows * table.cols,
  )
}

/** Read every page of the provisional, text-free provider result without mixing inputs. */
export async function collectObservedDraft(input: {
  path: string
  template: string
  draftSha256: string
  templateSha256: string
  signal?: AbortSignal
  pageLimit?: number
  read: (
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<unknown>
}): Promise<ObservedDraftResult> {
  const limit = input.pageLimit ?? 100
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 500 ||
    !safePath(input.path) ||
    !safePath(input.template) ||
    !/^[a-f0-9]{64}$/.test(input.draftSha256) ||
    !/^[a-f0-9]{64}$/.test(input.templateSha256)
  )
    return unavailable('block_contract_violation')
  let offset = 0,
    digest: string | undefined,
    total: number | undefined,
    bytes = 0
  let identity: Page['conversionIdentity'] | undefined,
    dependencies: Dependency[] | undefined
  const blocks: ObservedDraftBlock[] = []
  for (let pageCount = 0; pageCount < 512; pageCount++) {
    input.signal?.throwIfAborted()
    const args: Record<string, unknown> = {
      path: input.path,
      template: input.template,
      offset,
      limit,
    }
    if (digest) args.expected_inputs_digest = digest
    const response = await input.read(args, input.signal)
    let copied: unknown
    try {
      copied = copyJson(response, RESULT_LIMITS)
    } catch {
      return unavailable('block_contract_violation')
    }
    input.signal?.throwIfAborted()
    if (!copied || typeof copied !== 'object' || Array.isArray(copied))
      return unavailable('block_contract_violation')
    const value = copied as Record<string, unknown>
    if (value.state === 'input_changed') return unavailable('input_changed')
    if (value.state === 'unavailable') return unavailable('unavailable')
    if (!validateObservedBlockPage(value))
      return unavailable('block_contract_violation')
    const page = value as unknown as Page
    const paths = page.inputDependencies.map((item) => item.path)
    if (
      new Set(paths).size !== paths.length ||
      paths.some((path) => !safePath(path)) ||
      page.inputDependencies[0].path !== input.path ||
      page.inputDependencies[1].path !== input.template ||
      page.inputsDigest !==
        (await canonicalDigest({
          version: page.version,
          inputDependencies: page.inputDependencies,
          conversionIdentity: page.conversionIdentity,
        })) ||
      page.conversionIdentity.blockContractVersion !== page.version ||
      (total !== undefined && page.totalBlocks !== total) ||
      page.offset !== offset ||
      page.blocks.length > limit ||
      page.offset + page.blocks.length > page.totalBlocks ||
      page.nextOffset !==
        (page.offset + page.blocks.length < page.totalBlocks
          ? page.offset + page.blocks.length
          : null) ||
      (page.nextOffset !== null && page.blocks.length === 0)
    )
      return unavailable('block_contract_violation')
    if (
      page.inputDependencies[0].sha256 !== input.draftSha256 ||
      page.inputDependencies[1].sha256 !== input.templateSha256 ||
      (digest !== undefined && page.inputsDigest !== digest)
    )
      return unavailable('input_changed')
    digest = page.inputsDigest
    total = page.totalBlocks
    identity = page.conversionIdentity
    dependencies = page.inputDependencies
    bytes += new TextEncoder().encode(JSON.stringify(page.blocks)).byteLength
    if (bytes > 64 * 1024 * 1024) return unavailable('unavailable')
    blocks.push(...page.blocks)
    if (page.nextOffset === null)
      return validBlocks(blocks, page.version)
        ? {
            state: 'available',
            coverage: 'partial_rendered_structure',
            inputsDigest: digest,
            conversionIdentity: identity,
            inputDependencies: dependencies,
            blocks,
          }
        : unavailable('block_contract_violation')
    offset = page.nextOffset
  }
  return unavailable('unavailable')
}
