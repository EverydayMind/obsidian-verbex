import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import {
  findingColumns,
  noteFormat,
  noteFormatLocale,
  noteFormatMatches,
} from '../../i18n/noteFormats'

import {
  FindingSchema,
  builtinFindingSchemas,
  findingSchema,
} from './findingSchemas'

export type NormalizedFindingMarkdown = {
  body: string
  issues: number
}

export type ReviewEvidence = {
  id: string
  text: string
}

export type PackedReviewMember = {
  unitId: string
  /** Wiki-relative unit path or display title (used for the 점검 범위 link). */
  title: string
  /** Review display text of the unit (treatyReviewText output). */
  text: string
}

export type PackedReviewEvidence = ReviewEvidence & { unitId: string }

export type PackedFindingDemux = {
  /** Canonical finding body per member — present for every attributable member. */
  perUnit: Map<string, NormalizedFindingMarkdown>
  /** Rows with no / unknown / multiple evidence IDs — a pack-global failure. */
  unattributableRows: string[]
  /** Members with zero attributed rows and no envelope line — requeue each. */
  missingEnvelope: string[]
  /** No issue-table header at all — a pack-global failure. */
  parseFailed: boolean
}

export const EXPECTED_FINDING_HEADER_COLS = findingColumns('ko')

export const FINDING_HEADER = `| ${EXPECTED_FINDING_HEADER_COLS.join(' | ')} |`
export const FINDING_SEPARATOR =
  '| - | --- | --- | --- | --- | --- | --- | --- |'
export const BATCH_OUTPUT_CONTRACT_HEADER = `| ${EXPECTED_FINDING_HEADER_COLS.map(
  (column, index) => (index === 3 ? noteFormat('evidence', 'ko') : column),
).join(' | ')} |`
function renderBatchOutputContract(
  tailInstruction: string,
  locale: ModelLocale,
): string {
  return [
    L(
      {
        ko: '## 배치 권장 출력 형식',
        en: '## Recommended batch output format',
      },
      locale,
    ),
    L(
      {
        ko: '배치 모드에서는 도구 호출, frontmatter, 경로 쓰기 없이 finding Markdown 본문만 출력하는 것을 권장합니다.',
        en: 'In batch mode, it is recommended to output only the finding Markdown body without tool calls, frontmatter, or writing paths.',
      },
      locale,
    ),
    L(
      {
        ko: '첫 줄에는 `점검 범위: ...`를 적어 주십시오.',
        en: `Write \`${noteFormat('scope', 'en')} ...\` on the first line.`,
      },
      locale,
    ),
    L(
      {
        ko: '이슈 표를 쓸 때는 아래 열 구성을 권장합니다.',
        en: 'The following column layout is recommended when writing an issue table.',
      },
      locale,
    ),
    `| ${findingColumns(locale)
      .map((column, index) =>
        index === 3 ? noteFormat('evidence', locale) : column,
      )
      .join(' | ')} |`,
    FINDING_SEPARATOR,
    L(
      {
        ko: '이슈가 없으면 데이터 행 없이 헤더와 구분선만 두어도 됩니다.',
        en: 'If there are no issues, the header and separator without data rows are sufficient.',
      },
      locale,
    ),
    tailInstruction,
  ].join('\n')
}

export function batchOutputContract(
  locale: ModelLocale = getModelLocale(),
): string {
  return renderBatchOutputContract(
    L(
      {
        ko: '마지막 줄에는 `불확실 항목: ...`을 적어 주십시오.',
        en: `Write \`${noteFormat('uncertain', 'en')} ...\` on the last line.`,
      },
      locale,
    ),
    locale,
  )
}
export function batchPackOutputContract(
  locale: ModelLocale = getModelLocale(),
): string {
  return renderBatchOutputContract(
    L(
      {
        ko: '`불확실 항목: ...` 뒤에는 출력 맨 끝에 `## 검토 상태` 블록을 붙이는 것을 권장합니다.',
        en: `After \`${noteFormat('uncertain', 'en')} ...\`, it is recommended to append a \`${noteFormat('reviewStatus', 'en')}\` block at the very end of the output.`,
      },
      locale,
    ),
    locale,
  )
}
export const PACK_ENVELOPE_HEADING = noteFormat('reviewStatus', 'ko')

function boundedEvidenceSegments(line: string, maxChars: number): string[] {
  const trimmed = line.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]
  const segments: string[] = []
  let start = 0
  while (start < trimmed.length) {
    let end = Math.min(start + maxChars, trimmed.length)
    if (end < trimmed.length) {
      const boundary = Math.max(
        trimmed.lastIndexOf('. ', end),
        trimmed.lastIndexOf('; ', end),
        trimmed.lastIndexOf(', ', end),
        trimmed.lastIndexOf(' ', end),
      )
      if (boundary > start + Math.floor(maxChars / 2)) end = boundary + 1
    }
    const segment = trimmed.slice(start, end).trim()
    if (segment) segments.push(segment)
    start = end
    while (start < trimmed.length && /\s/.test(trimmed[start])) start += 1
  }
  return segments
}

/** Build stable evidence IDs; the model selects an ID and the harness owns the quote. */
export function buildReviewEvidence(
  sourceText: string,
  maxChars = 180,
): ReviewEvidence[] {
  return sourceText
    .split('\n')
    .flatMap((line) =>
      line
        .split('|')
        .flatMap((cell) => boundedEvidenceSegments(cell, maxChars)),
    )
    .map((text, index) => ({
      id: `E${String(index + 1).padStart(4, '0')}`,
      text,
    }))
}

export function renderReviewEvidence(evidence: ReviewEvidence[]): string {
  return evidence.map((item) => `[${item.id}] ${item.text}`).join('\n')
}

/**
 * Slice packing (batch runner §3.6). Evidence provenance is the demux key: the
 * harness knows which member unit every span came from, so the model never has
 * to structure its output per unit — each finding row is attributed by the one
 * evidence ID it selects. IDs are numbered continuously across the whole pack.
 *
 * NOTE: Explicitly designed for the issue_table_v1 schema.
 */
export function buildPackedReviewEvidence(
  members: PackedReviewMember[],
  maxChars = 180,
): PackedReviewEvidence[] {
  const packed: PackedReviewEvidence[] = []
  for (const member of members) {
    for (const item of buildReviewEvidence(member.text, maxChars)) {
      packed.push({
        id: `E${String(packed.length + 1).padStart(4, '0')}`,
        unitId: member.unitId,
        text: item.text,
      })
    }
  }
  return packed
}

/**
 * Renders packed review evidence in markdown format.
 * NOTE: Explicitly designed for the issue_table_v1 schema.
 */
export function renderPackedReviewEvidence(
  members: PackedReviewMember[],
  evidence: PackedReviewEvidence[],
): string {
  const sections: string[] = []
  for (const member of members) {
    const lines = evidence
      .filter((item) => item.unitId === member.unitId)
      .map((item) => `[${item.id}] ${item.text}`)
    sections.push(
      [
        `### ${member.unitId} — ${member.title.replace(/\.md$/i, '')}`,
        ...lines,
      ].join('\n'),
    )
  }
  return sections.join('\n\n')
}

/**
 * Completeness envelope (§3.6-5): a zero-row unit is indistinguishable from a
 * skipped unit, so the model must end with one status line per member. Members
 * that produced attributed rows are covered by the rows themselves; the
 * envelope is only required for silent members.
 *
 * NOTE: Explicitly designed for the issue_table_v1 schema.
 */
export function parsePackEnvelope(
  raw: string,
  members: PackedReviewMember[],
): Set<string> {
  const acknowledged = new Set<string>()
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const headingIndex = lines.findIndex((line) =>
    noteFormatMatches(line.trim().replace(/^#{2,4}\s*/, '## '), 'reviewStatus'),
  )
  if (headingIndex < 0) return acknowledged
  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim()
    if (/^#{1,6}\s/.test(trimmed)) break
    if (!trimmed.startsWith('-')) continue
    for (const member of members) {
      if (trimmed.includes(member.unitId)) acknowledged.add(member.unitId)
    }
  }
  return acknowledged
}

/**
 * Demuxes a packed review finding block back into individual member finding results.
 * NOTE: Explicitly designed for the issue_table_v1 schema.
 */
export function demuxPackedFinding(
  raw: string,
  members: PackedReviewMember[],
  evidence: PackedReviewEvidence[],
): PackedFindingDemux {
  const perUnit = new Map<string, NormalizedFindingMarkdown>()
  const unattributableRows: string[] = []
  const extracted = extractFindingRows(raw)
  if (!extracted.headerFound) {
    return {
      perUnit,
      unattributableRows,
      missingEnvelope: [],
      parseFailed: true,
    }
  }
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  const rowsByUnit = new Map<string, string[][]>()
  for (const cells of extracted.rows) {
    const ids = extractRowEvidenceIds(cells)
    const item = ids.length === 1 ? evidenceById.get(ids[0]) : undefined
    if (!item) {
      unattributableRows.push(`| ${cells.join(' | ')} |`)
      continue
    }
    cells[3] = item.text
    cells[1] = canonicalizeSeverity(cells[1])
    const rows = rowsByUnit.get(item.unitId) ?? []
    rows.push(cells)
    rowsByUnit.set(item.unitId, rows)
  }
  const envelope = parsePackEnvelope(raw, members)
  const missingEnvelope: string[] = []
  for (const member of members) {
    const rows = rowsByUnit.get(member.unitId) ?? []
    if (rows.length === 0 && !envelope.has(member.unitId)) {
      missingEnvelope.push(member.unitId)
      continue
    }
    perUnit.set(member.unitId, {
      body: renderFindingTable(member.title, rows, noteFormatLocale(raw)),
      issues: rows.length,
    })
  }
  return { perUnit, unattributableRows, missingEnvelope, parseFailed: false }
}

function isNoIssueCell(value: string | undefined): boolean {
  return /^(?:\s*|-|없음|n\.?a\.?|n\/?a|해당\s*없음|none|not\s*applicable)$/i.test(
    value ?? '',
  )
}

/**
 * Small models frequently write a Korean severity word instead of the
 * required English enum. The label is a translatable technicality, not a
 * quality signal — normalize known synonyms before enum validation so a
 * substantively valid finding (real evidence, real problem/fix) is not
 * discarded over language alone. Values not in this table are left
 * untouched and still fail `validateFindingEnums` as before.
 */
const SEVERITY_CANONICAL_BY_SYNONYM: Record<string, string> = {
  심각: 'Critical',
  치명적: 'Critical',
  중대한: 'Critical',
  중대: 'Critical',
  높음: 'Major',
  주요: 'Major',
  보통: 'Major',
  경미: 'Minor',
  낮음: 'Minor',
  사소: 'Minor',
  경미한: 'Minor',
  권고: 'Suggestion',
  제안: 'Suggestion',
  참고: 'Suggestion',
}

function canonicalizeSeverity(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (findingSchema().columns[1]?.enum?.includes(trimmed)) return trimmed
  return SEVERITY_CANONICAL_BY_SYNONYM[trimmed] ?? trimmed
}

function isNoIssueRow(cells: string[]): boolean {
  return (
    cells.length >= EXPECTED_FINDING_HEADER_COLS.length &&
    isNoIssueCell(cells[3]) &&
    isNoIssueCell(cells[4]) &&
    isNoIssueCell(cells[5])
  )
}

function extractFindingRows(raw: string): {
  headerFound: boolean
  rows: string[][]
} {
  const text = raw.replace(/\r\n?/g, '\n')
  const headerStart = text.split('\n').findIndex((line) => {
    const cells = parseFindingTableCells(line.slice(line.indexOf('|')))
    return cells[0] === '#' && noteFormatMatches(cells[1] ?? '', 'severity')
  })
  if (headerStart < 0) return { headerFound: false, rows: [] }
  const rows = text
    .split('\n')
    .slice(headerStart)
    .filter((line) => /^\s*\|\s*\d+\s*\|/.test(line))
    .map((line) => parseFindingTableCells(line))
    .filter((cells) => !isNoIssueRow(cells))
  return { headerFound: true, rows }
}

function extractRowEvidenceIds(cells: string[]): string[] {
  return [...(cells[3] ?? '').matchAll(/\bE\d{3,}\b/gi)].map((match) =>
    match[0].toUpperCase(),
  )
}

function renderFindingTable(
  unitTarget: string,
  rows: string[][],
  locale = getModelLocale(),
): string {
  const renderedRows = rows.map((cells, index) => {
    const next = [...cells]
    next[0] = String(index + 1)
    return `| ${next.join(' | ')} |`
  })
  return [
    `${noteFormat('scope', locale)} [[${unitTarget.replace(/\.md$/i, '')}]]`,
    '',
    `| ${findingColumns(locale).join(' | ')} |`,
    FINDING_SEPARATOR,
    ...renderedRows,
    '',
    `${noteFormat('uncertain', locale)} ${noteFormat('none', locale)}`,
  ].join('\n')
}

/**
 * Extract the issue table from a small-model response and render the stable
 * finding contract ourselves. Models frequently prepend analysis and even glue
 * the header to the final prose sentence; neither is meaningful finding data.
 *
 * NOTE: Explicitly designed for the issue_table_v1 schema.
 */
export function normalizeFindingMarkdown(
  raw: string,
  unitTarget: string,
  evidence: ReviewEvidence[] = [],
): NormalizedFindingMarkdown {
  const extracted = extractFindingRows(raw)
  if (!extracted.headerFound) {
    const text = raw.replace(/\r\n?/g, '\n')
    return { body: text.trim(), issues: countIssueTableRows(text) }
  }

  const normalizedRows: string[][] = []
  const evidenceById = new Map(evidence.map((item) => [item.id, item.text]))
  for (const cells of extracted.rows) {
    const evidenceIds = extractRowEvidenceIds(cells)
    const evidenceId = evidenceIds.length === 1 ? evidenceIds[0] : null
    if (evidenceId && evidenceById.has(evidenceId)) {
      cells[3] = evidenceById.get(evidenceId) ?? cells[3]
    }
    cells[1] = canonicalizeSeverity(cells[1])
    normalizedRows.push(cells)
  }

  return {
    body: renderFindingTable(unitTarget, normalizedRows, noteFormatLocale(raw)),
    issues: normalizedRows.length,
  }
}

/**
 * Validates the markdown table schema and columns count dynamically.
 * Under-padded and over-padded rows will be strictly rejected.
 */
export function validateFindingTableStructure(
  body: string,
  schema: FindingSchema = findingSchema(),
): string[] {
  schema = schemaForStoredFinding(schema, body)
  const errors: string[] = []
  const lines = body.split('\n')
  const expected = schema.columns.map((column) => column.name)
  const header = lines.find((line) => {
    const cells = parseFindingTableCells(line)
    return cells[0]?.replace(/\s*\([^)]*\)\s*$/, '').trim() === expected[0]
  })
  if (!header) {
    errors.push(
      L({
        ko: '이슈 표 헤더가 없습니다.',
        en: 'The issue table header is missing.',
      }),
    )
  } else {
    const actual = parseFindingTableCells(header).map((cell) =>
      cell.replace(/\s*\([^)]*\)\s*$/, '').trim(),
    )
    if (
      actual.length !== expected.length ||
      actual.some((cell, index) => cell !== expected[index])
    ) {
      errors.push(
        L({
          ko: `이슈 표 스키마가 일치하지 않습니다: ${actual.join(' | ')}. 기대 컬럼들: ${expected.join(' | ')}`,
          en: `Issue table schema mismatch: ${actual.join(' | ')}. Expected columns: ${expected.join(' | ')}`,
        }),
      )
    }
  }

  for (const line of lines.filter((value) => /^\s*\|\s*\d+\s*\|/.test(value))) {
    const cells = parseFindingTableCells(line)
    if (cells.length !== expected.length) {
      errors.push(
        L({
          ko: `이슈 표 열 수가 ${cells.length}개입니다(필수 ${expected.length}개). findings_markdown의 각 데이터 행은 반드시 스키마 규격인 ${expected.length}열 마크다운 표 형식이어야 하며 각 행이 '|'로 올바르게 닫혀 열의 개수가 일치하는지 확인해 주십시오.`,
          en: `The issue table has ${cells.length} columns (${expected.length} required). Each findings_markdown data row must be a Markdown table row with exactly ${expected.length} columns as specified by the schema. Check that each row is properly closed with '|' and has the correct column count.`,
        }),
      )
    }
  }

  return errors
}

/**
 * Validates the finding body, checks issue count and schema columns.
 */
export function validateFindingBody(
  body: string,
  issues: number,
  schema: FindingSchema = findingSchema(),
): string[] {
  const errors = validateFindingTableStructure(body, schema)
  const rows = countIssueTableRows(body)
  if (rows !== issues) {
    errors.push(
      L({
        ko: `오류: submit_finding을 호출할 때 issues의 값(${issues})은 findings_markdown 마크다운 표의 데이터 행 개수(${rows})와 반드시 일치해야 합니다. Suggestion 등 경미한 건이라도 표 행으로 작성했다면 issues를 ${rows}로 지정하고, 이슈가 0건이라면 findings_markdown 표를 비우거나 status를 "skipped"로 지정하십시오.`,
        en: `Error: When calling submit_finding, issues (${issues}) must match the number of data rows (${rows}) in the findings_markdown Markdown table. Even minor issues such as Suggestion must be counted if written as table rows: set issues to ${rows}. If there are no issues, leave the findings_markdown table empty or set status to "skipped".`,
      }),
    )
  }
  errors.push(...validateFindingEnums(body, schema))
  return errors
}

function schemaForStoredFinding(
  schema: FindingSchema,
  body: string,
): FindingSchema {
  const builtIn = (['ko', 'en'] as const).some(
    (locale) =>
      JSON.stringify(builtinFindingSchemas(locale)[schema.id]) ===
      JSON.stringify(schema),
  )
  return builtIn
    ? findingSchema(schema.id, undefined, noteFormatLocale(body))
    : schema
}

function validateFindingEnums(body: string, schema: FindingSchema): string[] {
  schema = schemaForStoredFinding(schema, body)
  const errors: string[] = []
  for (const line of body
    .split('\n')
    .filter((value) => /^\s*\|\s*\d+\s*\|/.test(value))) {
    const cells = parseFindingTableCells(line)
    schema.columns.forEach((column, index) => {
      if (column.enum && cells[index] && !column.enum.includes(cells[index])) {
        errors.push(
          L({
            ko: `허용되지 않은 ${column.name}: ${cells[index]}`,
            en: `Invalid value for ${column.name}: ${cells[index]}`,
          }),
        )
      }
    })
  }
  return errors
}

export function parseFindingTableCells(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith('|') && !trimmed.endsWith('|')) {
    trimmed += '|'
  }
  return trimmed
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())
}

function normalizeQuoteForComparison(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedWikiTarget(value: string): string {
  return value.split('|', 1)[0].split('#', 1)[0].trim().replace(/\.md$/i, '')
}

function validateFindingAgainstSourceCore(
  body: string,
  sourceText: string,
  knownWikiTargets: Iterable<string>,
  initialErrors: string[],
): string[] {
  const errors = [...initialErrors]
  const lines = body.split('\n')

  for (const line of lines.filter((value) => /^\s*\|\s*\d+\s*\|/.test(value))) {
    const cells = parseFindingTableCells(line)
    if (cells.length < EXPECTED_FINDING_HEADER_COLS.length) {
      continue
    }
    const quote = cells[3]
      .replace(/^`|`$/g, '')
      .replace(/^["“”']|["“”']$/g, '')
      .trim()
    if (
      !quote ||
      !normalizeQuoteForComparison(sourceText).includes(
        normalizeQuoteForComparison(quote),
      )
    ) {
      errors.push(
        L({
          ko: `원문에 없는 핵심 인용: ${cells[3] || '(비어 있음)'}`,
          en: `Key quote not found in the source: ${cells[3] || '(empty)'}`,
        }),
      )
    }
    if (
      !cells[5] ||
      /^(?:-|없음|n\/?a|tbd|placeholder|none|not\s*applicable)$/i.test(cells[5])
    ) {
      errors.push(
        L({
          ko: `수정안이 비어 있거나 플레이스홀더입니다: 이슈 ${cells[0]}`,
          en: `The proposed fix is empty or a placeholder: issue ${cells[0]}`,
        }),
      )
    }
  }

  const known = [...knownWikiTargets].map(normalizedWikiTarget).filter(Boolean)
  if (known.length > 0) {
    const links = body.matchAll(/\[\[([^\]]+)\]\]/g)
    for (const match of links) {
      const target = normalizedWikiTarget(match[1])
      const resolved = known.some(
        (candidate) => candidate === target || candidate.endsWith(`/${target}`),
      )
      if (!resolved)
        errors.push(
          L({
            ko: `존재하지 않는 wiki 링크: [[${match[1]}]]`,
            en: `Wiki link does not exist: [[${match[1]}]]`,
          }),
        )
    }
  }
  return [...new Set(errors)]
}

export function validateFindingAgainstSource(
  body: string,
  issues: number,
  sourceText: string,
  knownWikiTargets: Iterable<string> = [],
): string[] {
  return validateFindingAgainstSourceCore(
    body,
    sourceText,
    knownWikiTargets,
    validateFindingBody(body, issues),
  )
}

export function validateBatchFindingAgainstSource(
  body: string,
  sourceText: string,
  knownWikiTargets: Iterable<string> = [],
): string[] {
  return validateBatchFindingAgainstSourceDetailed(
    body,
    sourceText,
    knownWikiTargets,
  ).errors
}

export type BatchFindingValidationResult = {
  errors: string[]
  structuralErrors: string[]
  fidelityErrors: string[]
}

export function validateBatchFindingAgainstSourceDetailed(
  body: string,
  sourceText: string,
  knownWikiTargets: Iterable<string> = [],
): BatchFindingValidationResult {
  const initialErrors = [
    ...validateFindingTableStructure(body),
    ...validateFindingEnums(body, findingSchema()),
  ]
  const errors = validateFindingAgainstSourceCore(
    body,
    sourceText,
    knownWikiTargets,
    initialErrors,
  )
  return {
    errors,
    structuralErrors: initialErrors,
    fidelityErrors: errors.filter((error) => !initialErrors.includes(error)),
  }
}

export function renderFindingNote(args: {
  docId: string
  unitOrderKey: string
  buildId: string
  unitHash: string
  issues: number
  body: string
  status?: 'done' | 'empty' | 'truncated'
  attempts?: number
  generatedAt?: string
  model?: string
}): string {
  const generatedAt = args.generatedAt ?? new Date().toISOString()
  const optional = [
    `status: ${args.status ?? 'done'}`,
    `attempts: ${args.attempts ?? 1}`,
    `generated_at: ${generatedAt}`,
    ...(args.model ? [`model: "${args.model.replace(/"/g, '\\"')}"`] : []),
  ]
  return `---\nverbex_index: "${args.docId.replace(/"/g, '\\"')}"\nkind: finding\nunit: "${args.unitOrderKey}"\nbuild_id: "${args.buildId}"\nunit_hash: "${args.unitHash}"\nreviewed_at: ${generatedAt.slice(0, 10)}\nissues: ${args.issues}\n${optional.join('\n')}\n---\n${args.body.trim()}\n`
}

export function countIssueTableRows(markdown: string): number {
  return markdown
    .split('\n')
    .filter((line) => /^\s*\|\s*\d+\s*\|/.test(line))
    .filter((line) => !isNoIssueRow(parseFindingTableCells(line))).length
}
