import { normalizePath } from 'obsidian'

import { L } from '../../i18n/modelText'
import {
  findingColumns,
  noteFormat,
  noteFormatLocale,
  noteFormatMatches,
} from '../../i18n/noteFormats'

import {
  IndexSource,
  IndexUnit,
  detectBoundaryProfile,
  parseStructure,
} from './structureParser'
export { detectBoundaryProfile, orderSourceFiles } from './structureParser'

export type TreatyUnitKind =
  | 'preamble'
  | 'chapter-head'
  | 'article'
  | 'annex-section'
  | 'chunk'

export type TreatyUnit = IndexUnit
export type TreatySource = IndexSource
export type CrossRef = {
  raw: string
  kind: 'internal' | 'external' | 'unresolved'
  resolvedOrderKey: string | null
}
export type DefinedTerm = {
  term: string
  definitionLine: string
  verb: 'means' | 'includes' | 'unknown'
  scope: 'agreement' | 'chapter' | 'unknown'
  definedInOrderKey: string
}

export type ChecklistItem = {
  state: 'pending' | 'done' | 'skipped'
  id: string
  target: string
  artifact?: string
  line: number
}

export const CHECKLIST_ITEM_RE =
  /^- \[( |x|-)\] ([A-Za-z][A-Za-z0-9_-]*:[A-Za-z0-9._-]+) :: (.+?)(?: :: (.+))?$/

const ROMAN: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
  XIII: 13,
  XIV: 14,
  XV: 15,
  XVI: 16,
  XVII: 17,
  XVIII: 18,
  XIX: 19,
  XX: 20,
}
const WORD_NUMBERS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
  TEN: 10,
  ELEVEN: 11,
  TWELVE: 12,
  THIRTEEN: 13,
  FOURTEEN: 14,
  FIFTEEN: 15,
  SIXTEEN: 16,
  SEVENTEEN: 17,
  EIGHTEEN: 18,
  NINETEEN: 19,
  TWENTY: 20,
}

export function normalizeForBoundary(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s*/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .replace(/^__(.*?)__$/, '$1')
    .trim()
}

function numberValue(raw: string): number | null {
  const key = raw.toUpperCase().replace(/[.:-]+$/, '')
  const numeric = Number(key)
  if (Number.isInteger(numeric) && numeric >= 0) return numeric
  return WORD_NUMBERS[key] ?? ROMAN[key] ?? null
}

function articleNumbers(
  title: string,
): { chapter: number; article: number } | null {
  const normalized = normalizeForBoundary(title)
  const en = /^ARTICLE\s+([0-9IVXLC]+)(?:[.-]([0-9]+))?\b/i.exec(normalized)
  if (en) {
    const chapter = numberValue(en[1])
    const article = en[2] ? Number(en[2]) : chapter
    return chapter == null || article == null ? null : { chapter, article }
  }
  const ko = /^제\s*(\d+)\s*조\b/.exec(normalized)
  return ko ? { chapter: 0, article: Number(ko[1]) } : null
}

export function parseTreatyStructure(
  sources: TreatySource[],
  maxUnitTokens = 4000,
  fallbackMode: 'none' | 'chunks' = 'none',
): { units: TreatyUnit[]; profile: string; warnings: string[] } {
  const parsed = parseStructure(sources, maxUnitTokens, fallbackMode)
  const detected = detectBoundaryProfile(
    sources.flatMap((source) => source.lines),
  )
  return { ...parsed, profile: detected?.profile.id ?? parsed.profile }
}

export function extractDefinedTerms(
  units: TreatyUnit[],
  bodies: Map<string, string>,
): DefinedTerm[] {
  const found = new Map<string, DefinedTerm>()
  for (const unit of units) {
    for (const line of (bodies.get(unit.orderKey) ?? '').split('\n')) {
      const match =
        /^\s*[“"]?([^“”";:]{2,80}?)[”"]?\s+(means|includes)\s+(.+)/i.exec(line)
      if (!match) continue
      const term = match[1].trim().replace(/^the\s+/i, '')
      if (!found.has(term.toLowerCase())) {
        found.set(term.toLowerCase(), {
          term,
          definitionLine: line.trim(),
          verb: match[2].toLowerCase() as 'means' | 'includes',
          scope: /for purposes of this agreement/i.test(line)
            ? 'agreement'
            : /for purposes of this chapter/i.test(line)
              ? 'chapter'
              : 'unknown',
          definedInOrderKey: unit.orderKey,
        })
      }
    }
  }
  return [...found.values()]
}

export function extractCrossRefs(
  body: string,
  units: TreatyUnit[],
): CrossRef[] {
  const refs: CrossRef[] = []
  const seen = new Set<string>()
  const unitByArticle = new Map<string, TreatyUnit>()
  for (const unit of units) {
    const numbers = articleNumbers(unit.title)
    if (numbers)
      unitByArticle.set(`${numbers.chapter}.${numbers.article}`, unit)
  }
  const re =
    /\b(Article\s+[0-9IVXLC]+(?:\.[0-9]+)?(?:\s+of\s+the\s+[A-Z][A-Za-z0-9 -]+)?|Annex\s+[A-Z0-9-]+)\b/gi
  for (const match of body.matchAll(re)) {
    const raw = match[1].trim()
    if (seen.has(raw.toLowerCase())) continue
    seen.add(raw.toLowerCase())
    if (/\sof\sthe\s(?:GATT|GATS|WTO|[A-Z].*Agreement)/i.test(raw)) {
      refs.push({ raw, kind: 'external', resolvedOrderKey: null })
      continue
    }
    const numbers = articleNumbers(raw)
    const resolved = numbers
      ? unitByArticle.get(`${numbers.chapter}.${numbers.article}`)
      : units.find((unit) =>
          unit.title.toLowerCase().startsWith(raw.toLowerCase()),
        )
    refs.push({
      raw,
      kind: resolved ? 'internal' : 'unresolved',
      resolvedOrderKey: resolved?.orderKey ?? null,
    })
  }
  return refs
}

export function indexTermUsage(
  terms: DefinedTerm[],
  units: TreatyUnit[],
  bodies: Map<string, string>,
): Map<string, { usedIn: string[]; caseVariants: string[] }> {
  const result = new Map<string, { usedIn: string[]; caseVariants: string[] }>()
  for (const term of terms) {
    const usedIn: string[] = []
    const variants = new Set<string>()
    const re = new RegExp(
      `\\b${term.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'gi',
    )
    for (const unit of units) {
      const body = bodies.get(unit.orderKey) ?? ''
      const matches = [...body.matchAll(re)].map((match) => match[0])
      if (matches.length > 0 && unit.orderKey !== term.definedInOrderKey)
        usedIn.push(unit.orderKey)
      matches
        .filter((value) => value !== term.term)
        .forEach((value) => variants.add(value))
    }
    result.set(term.term, { usedIn, caseVariants: [...variants] })
  }
  return result
}

export function safeWikiName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|#[\]^]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function safeUnitName(value: string): string {
  return safeWikiName(value).replace(/[.\s]+$/, '')
}

export function parseChecklist(markdown: string): ChecklistItem[] {
  return markdown.split('\n').flatMap((line, index) => {
    const match = CHECKLIST_ITEM_RE.exec(line)
    if (!match) return []
    return [
      {
        state:
          match[1] === 'x' ? 'done' : match[1] === '-' ? 'skipped' : 'pending',
        id: match[2],
        target: match[3],
        artifact: match[4],
        line: index + 1,
      } satisfies ChecklistItem,
    ]
  })
}

export function checklistPhaseIds(
  markdown: string,
  items: ChecklistItem[],
): string[] {
  const ids = new Set<string>()
  for (const match of markdown.matchAll(
    /^## Phase ([A-Za-z][A-Za-z0-9_-]*) — /gm,
  ))
    ids.add(match[1])
  for (const item of items) ids.add(item.id.split(':')[0])
  ids.delete('F')
  return ids.size ? [...ids] : ['R']
}

export function emptyChecklistPhaseError(phase: string): Error {
  return new Error(
    L({
      ko: `Phase ${phase} 항목이 없습니다. 체크리스트를 확인하십시오.`,
      en: `Phase ${phase} has no items. Check the checklist.`,
    }),
  )
}

export function duplicateChecklistIds(
  items: ChecklistItem[],
): { id: string; lines: number[] }[] {
  const byId = new Map<string, number[]>()
  for (const item of items) {
    byId.set(item.id, [...(byId.get(item.id) ?? []), item.line])
  }
  return [...byId.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([id, lines]) => ({ id, lines }))
}

export function formatDuplicateChecklistIds(
  duplicates: { id: string; lines: number[] }[],
): string {
  return duplicates
    .map((entry) =>
      L({
        ko: `${entry.id} (${entry.lines.length}회: L${entry.lines.join(', L')})`,
        en: `${entry.id} (${entry.lines.length} occurrences: L${entry.lines.join(', L')})`,
      }),
    )
    .join(', ')
}

export function checklistPhaseProgress(items: ChecklistItem[], phase: string) {
  const phaseItems = items.filter((item) => item.id.startsWith(`${phase}:`))
  const done = phaseItems.filter((item) => item.state === 'done').length
  const skipped = phaseItems.filter((item) => item.state === 'skipped').length
  return {
    total: phaseItems.length,
    done,
    skipped,
    processed: done + skipped,
    complete: phaseItems.length > 0 && done + skipped === phaseItems.length,
  }
}

export function toggleChecklistItem(
  markdown: string,
  itemId: string,
  status: 'done' | 'skipped',
  note: string,
): { markdown?: string; alreadyState?: string; error?: string } {
  const items = parseChecklist(markdown)
  const duplicates = duplicateChecklistIds(items)
  if (duplicates.length > 0) {
    return {
      error: L({
        ko: `체크리스트 중복 id 감지: ${formatDuplicateChecklistIds(duplicates)}`,
        en: `Duplicate checklist IDs detected: ${formatDuplicateChecklistIds(duplicates)}`,
      }),
    }
  }
  const item = items.find((candidate) => candidate.id === itemId)
  if (!item)
    return {
      error: L({
        ko: `체크리스트 항목을 찾지 못했습니다: ${itemId}`,
        en: `Checklist item not found: ${itemId}`,
      }),
    }
  if (item.state !== 'pending') return { alreadyState: item.state }
  const lines = markdown.split('\n')
  lines[item.line - 1] = lines[item.line - 1].replace(
    '- [ ]',
    status === 'done' ? '- [x]' : '- [-]',
  )
  const timestamp = new Date().toISOString()
  const normalizedNote = note
    ? note.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
    : ''
  const log = `- ${timestamp} ${itemId} ${status}${normalizedNote ? ` ${normalizedNote}` : ''}`
  const logHeading = lines.findIndex((line) => noteFormatMatches(line, 'log'))
  if (logHeading < 0)
    lines.push('', noteFormat('log', noteFormatLocale(markdown)), log)
  else lines.push(log)
  return { markdown: lines.join('\n') }
}

export function countIssueTableRows(body: string): number {
  return body.split('\n').filter((line) => /^\s*\|\s*\d+\s*\|/.test(line))
    .length
}

export type NormalizedFindingMarkdown = {
  body: string
  issues: number
}

export type ReviewEvidence = {
  id: string
  text: string
}

export const EXPECTED_FINDING_HEADER_COLS = findingColumns('ko')
export const FINDING_HEADER = `| ${EXPECTED_FINDING_HEADER_COLS.join(' | ')} |`
export const FINDING_SEPARATOR =
  '| - | --- | --- | --- | --- | --- | --- | --- |'

function decodeReviewHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, key: string) => {
      const normalized = key.toLowerCase()
      if (normalized.startsWith('#x')) {
        const code = Number.parseInt(normalized.slice(2), 16)
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity
      }
      if (normalized.startsWith('#')) {
        const code = Number.parseInt(normalized.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity
      }
      return named[normalized] ?? entity
    },
  )
}

/** Render Markdown/HTML treaty units into the same visible text for prompt and validation. */
export function treatyReviewText(markdown: string): string {
  return decodeReviewHtmlEntities(
    markdown
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:td|th)>/gi, '\t')
      .replace(/<\/(?:tr|table|p|li|div|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export class FindingValidationError extends Error {
  constructor(
    public readonly errors: string[],
    public readonly canonicalItemId: string,
    public readonly buildId: string,
    public readonly indexFolder: string,
  ) {
    super(errors.join(' '))
    this.name = 'FindingValidationError'
  }
}

export function parseChecklistLogs(
  markdown: string,
): Map<string, { status: string; note?: string }> {
  const logMap = new Map<string, { status: string; note?: string }>()
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const logHeadingIndex = lines.findIndex((line) =>
    noteFormatMatches(line, 'log'),
  )
  if (logHeadingIndex >= 0) {
    for (const line of lines.slice(logHeadingIndex + 1)) {
      const match =
        /^- \d{4}-\d{2}-\d{2}T[^\s]+ ([A-Za-z0-9_-]+:[A-Za-z0-9._-]+) (\w+)(?:\s+(.*))?$/.exec(
          line.trim(),
        )
      if (match) {
        const itemId = match[1]
        const status = match[2]
        const note = match[3] ? match[3].trim() : undefined
        logMap.set(itemId, { status, note })
      }
    }
  }
  return logMap
}

export function resolveChecklistItem(
  checklistMarkdown: string,
  itemId?: string,
): ChecklistItem | null {
  const items = parseChecklist(checklistMarkdown)
  if (duplicateChecklistIds(items).length > 0) return null
  if (!itemId) {
    return items.find((candidate) => candidate.state === 'pending') ?? null
  }
  return (
    items.find((candidate) => candidate.id === itemId) ??
    items.find((candidate) => candidate.id.split(':', 2)[1] === itemId) ??
    null
  )
}

export type SelectedXrefsResult = {
  selected: { unit: TreatyUnit; internalCount: number; hasAnnex: boolean }[]
  matchedCount: number
}

export function selectReviewIndexXrefs(
  units: TreatyUnit[],
  bodies: Map<string, string>,
): SelectedXrefsResult {
  const list = units
    .map((unit) => {
      const body = bodies.get(unit.orderKey) ?? ''
      const refs = extractCrossRefs(body, units)
      const internalCount = refs.filter((ref) => ref.kind === 'internal').length
      const hasAnnex = refs.some((ref) => /^Annex\b/i.test(ref.raw))
      return { unit, internalCount, hasAnnex }
    })
    .filter(({ internalCount, hasAnnex }) => internalCount >= 3 || hasAnnex)
    .sort((a, b) => {
      return (
        b.internalCount - a.internalCount ||
        a.unit.orderKey.localeCompare(b.unit.orderKey)
      )
    })
  return {
    selected: list.slice(0, 20),
    matchedCount: list.length,
  }
}

export function resolveTreatyPath(
  folder: string,
  relative: string,
): string | null {
  const root = normalizePath(folder.trim()).replace(/\/$/, '')
  if (!root) return null
  const raw = relative.trim()
  if (!raw || /^[\\/]/.test(raw)) return null
  const segments = raw.split(/[\\/]/).filter((segment) => segment.length > 0)
  if (segments.length === 0) return null
  if (segments.some((segment) => segment === '..' || segment === '.'))
    return null
  const candidate = normalizePath(`${root}/${segments.join('/')}`)
  return candidate.startsWith(`${root}/`) ? candidate : null
}
