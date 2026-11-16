import { L } from '../../i18n/modelText'
import { estimateTokens } from '../../utils/llm/estimateTokens'

export type IndexUnitKind = string

export type IndexUnit = {
  kind: IndexUnitKind
  orderKey: string
  title: string
  sourcePath: string
  startLine: number
  endLine: number
  part?: { index: number; total: number }
}

export type IndexSource = { path: string; lines: string[] }

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

function looksArticleProseRemainder(remainder: string): boolean {
  const trimmed = remainder.trim()
  if (/^[,;]/.test(trimmed)) return true
  const cleaned = trimmed.replace(/^[:.-]\s*/, '')
  return /^(shall|must|may|will|should|does?|did|is|are|was|were|be|being|been|has|have|had|applies?|means|includes?|provides?|requires?|sets?|establishes?|covers?|refers?|allows?|permits?|prohibits?|of|under|pursuant|not)\b/i.test(
    cleaned,
  )
}

function articleNumbers(
  title: string,
): { chapter: number; article: number } | null {
  const normalized = normalizeForBoundary(title)
  const en =
    /^ARTICLE\s+([0-9IVXLC]+)(?:[.-]([0-9]+))?(?:\b|\s*[:.-])\s*(.*)$/i.exec(
      normalized,
    )
  if (en) {
    if (looksArticleProseRemainder(en[3] ?? '')) return null
    const chapter = numberValue(en[1])
    const article = en[2] ? Number(en[2]) : chapter
    return chapter == null || article == null ? null : { chapter, article }
  }
  const ko = /^제\s*(\d+)\s*조\b/.exec(normalized)
  return ko ? { chapter: 0, article: Number(ko[1]) } : null
}

function chapterNumber(title: string): number | null {
  const match = /^CHAPTER\s+([A-Z0-9IVXLC]+)\s*$/i.exec(
    normalizeForBoundary(title),
  )
  return match ? numberValue(match[1]) : null
}

function stripLeadingFrontmatter(lines: string[]): {
  lines: string[]
  offset: number
} {
  if (lines[0]?.trim() !== '---') return { lines, offset: 0 }
  const end = lines.slice(1).findIndex((line) => line.trim() === '---')
  return end < 0
    ? { lines, offset: 0 }
    : { lines: lines.slice(end + 2), offset: end + 2 }
}

export function detectBoundaryProfile(lines: string[]): {
  profile: { id: 'plain-en' | 'markdown-en' | 'korean' | 'annex' }
  score: number
  warnings: string[]
} | null {
  const normalized = lines.map(normalizeForBoundary)
  const articles = normalized.filter((line) => articleNumbers(line)).length
  const korean = normalized.filter((line) =>
    /^제\s*\d+\s*조\b/.test(line),
  ).length
  const annex = normalized.filter((line) =>
    /^ANNEX\s+[A-Z0-9-]+\b/i.test(line),
  ).length
  if (articles > 0) {
    const markdown = lines.some((line) =>
      /^\s*(?:#{1,6}\s+|\*\*)ARTICLE\b/i.test(line),
    )
    return {
      profile: { id: markdown ? 'markdown-en' : 'plain-en' },
      score: articles,
      warnings: [],
    }
  }
  if (korean > 0)
    return { profile: { id: 'korean' }, score: korean, warnings: [] }
  if (annex > 0) return { profile: { id: 'annex' }, score: annex, warnings: [] }
  return null
}

export function orderSourceFiles(
  sources: IndexSource[],
): { ordered: IndexSource[]; warnings: string[] } | { error: string } {
  const rows = sources.map((source) => {
    const hit = source.lines.map(chapterNumber).find((value) => value !== null)
    return { source, chapter: hit ?? null }
  })
  const seen = new Set<number>()
  for (const row of rows) {
    if (row.chapter == null) continue
    if (seen.has(row.chapter))
      return {
        error: L({
          ko: `중복된 챕터 번호: ${row.chapter}`,
          en: `Duplicate chapter number: ${row.chapter}`,
        }),
      }
    seen.add(row.chapter)
  }
  const warnings = rows
    .filter((row) => row.chapter == null)
    .map((row) =>
      L({
        ko: `${row.source.path}: 챕터 번호를 찾지 못해 뒤에 배치했습니다.`,
        en: `${row.source.path}: No chapter number found; placed at the end.`,
      }),
    )
  rows.sort(
    (a, b) =>
      (a.chapter ?? Number.MAX_SAFE_INTEGER) -
        (b.chapter ?? Number.MAX_SAFE_INTEGER) ||
      a.source.path.localeCompare(b.source.path),
  )
  return { ordered: rows.map((row) => row.source), warnings }
}

type Boundary = {
  index: number
  title: string
  kind: IndexUnitKind
  orderKey: string
}

function boundariesForLegalNumbered(lines: string[]): Boundary[] {
  const boundaries: Boundary[] = []
  let currentChapter = 0
  let chapterArticle = 0
  let annexCount = 0
  for (let index = 0; index < lines.length; index += 1) {
    const title = normalizeForBoundary(lines[index])
    if (/^PREAMBLE\s*$/i.test(title)) {
      boundaries.push({ index, title, kind: 'preamble', orderKey: '00-00' })
      continue
    }
    const chapter = chapterNumber(title)
    if (chapter !== null) {
      currentChapter = chapter
      chapterArticle = 0
      boundaries.push({
        index,
        title,
        kind: 'chapter-head',
        orderKey: `${String(chapter).padStart(2, '0')}-00`,
      })
      continue
    }
    const article = articleNumbers(title)
    if (article) {
      if (article.chapter > 0) currentChapter = article.chapter
      chapterArticle = article.article || chapterArticle + 1
      boundaries.push({
        index,
        title,
        kind: 'article',
        orderKey: `${String(currentChapter).padStart(2, '0')}-${String(chapterArticle).padStart(2, '0')}`,
      })
      continue
    }
    const annex = /^ANNEX\s+([A-Z0-9-]+)\b/i.exec(title)
    if (annex) {
      annexCount += 1
      boundaries.push({
        index,
        title,
        kind: 'annex-section',
        orderKey: `A${annex[1].replace(/-/g, '')}-${String(annexCount - 1).padStart(2, '0')}`,
      })
    }
  }

  // Rollback duplicate PREAMBLE logic
  if (boundaries.length === 0) {
    boundaries.unshift({
      index: 0,
      title: 'PREAMBLE',
      kind: 'preamble',
      orderKey: '00-00',
    })
  } else if (boundaries[0].index > 0) {
    if (boundaries[0].kind === 'preamble') {
      boundaries[0].index = 0
    } else {
      boundaries.unshift({
        index: 0,
        title: 'PREAMBLE',
        kind: 'preamble',
        orderKey: '00-00',
      })
    }
  }
  return boundaries
}

function boundariesForHeadings(lines: string[]): Boundary[] {
  const boundaries: Boundary[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = /^(?:\s*#{1,6}\s+)(.+)/.exec(line)
    if (match) {
      boundaries.push({
        index,
        title: match[1].trim(),
        kind: 'headings',
        orderKey: `H-${String(boundaries.length + 1).padStart(4, '0')}`,
      })
    }
  }
  if (boundaries.length === 0) {
    boundaries.unshift({
      index: 0,
      title: 'PREAMBLE',
      kind: 'preamble',
      orderKey: '00-00',
    })
  } else if (boundaries[0].index > 0) {
    boundaries.unshift({
      index: 0,
      title: 'PREAMBLE',
      kind: 'preamble',
      orderKey: '00-00',
    })
  }
  return boundaries
}

export type DeclarativeBoundaryRule = {
  kind: string
  pattern: string
  parent?: string
  /** Match pattern case-insensitively (legacy default is case-sensitive, matching prior behavior). */
  caseInsensitive?: boolean
  titleOnly?: boolean
  isParentBoundary?: boolean
  parentNumberGroup?: number
  childNumberGroup?: number
  labelGroup?: number
  counterScope?: 'global' | 'parent'
  rejectRemainder?: string
  fixedOrderKey?: string
}

// A3: declarative boundary engine. Extends the original kind+pattern+parent
// model with fields that let a workflow YAML profile reproduce
// boundariesForLegalNumbered's chapter-scoped article renumbering, global
// ANNEX counter, and Article-prose false-positive guard without a
// domain-specific parser in code. The plain kind+pattern path (no capture
// fields) is unchanged from before this extension - existing declarative
// profiles (e.g. company-rules) keep their exact prior output.
function boundariesForDeclarative(
  lines: string[],
  rules: DeclarativeBoundaryRule[],
): Boundary[] {
  const compiled = rules.map((rule) => ({
    ...rule,
    regex: new RegExp(rule.pattern, rule.caseInsensitive ? 'i' : undefined),
  }))
  const parentCounters = new Map<string, number>()
  const globalCounters = new Map<string, number>()
  let parent = '00'
  const boundaries: Boundary[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const title = normalizeForBoundary(lines[index])
    for (const rule of compiled) {
      const match = rule.regex.exec(title)
      if (!match) continue
      if (
        rule.titleOnly &&
        (match.index !== 0 || match[0].length !== title.length)
      )
        continue
      if (rule.rejectRemainder) {
        const remainder = title.slice(match.index + match[0].length).trim()
        if (/^[,;]/.test(remainder)) continue
        const cleaned = remainder.replace(/^[:.-]\s*/, '')
        if (new RegExp(`^(${rule.rejectRemainder})\\b`, 'i').test(cleaned))
          continue
      }

      if (rule.parentNumberGroup != null) {
        const value = numberValue(match[rule.parentNumberGroup] ?? '')
        if (value != null && value > 0) parent = String(value).padStart(2, '0')
      }

      let orderKey: string
      if (rule.fixedOrderKey) {
        orderKey = rule.fixedOrderKey
      } else if (rule.labelGroup != null) {
        const label = (match[rule.labelGroup] ?? '').replace(/-/g, '')
        const useGlobal = rule.counterScope !== 'parent'
        const counterMap = useGlobal ? globalCounters : parentCounters
        const counterKey = useGlobal ? rule.kind : `${parent}:${rule.kind}`
        const next = counterMap.get(counterKey) ?? 0
        counterMap.set(counterKey, next + 1)
        orderKey = `A${label}-${String(next).padStart(2, '0')}`
      } else if (rule.isParentBoundary) {
        orderKey = `${parent}-00`
      } else if (rule.childNumberGroup != null) {
        const explicit = match[rule.childNumberGroup]
        const counterKey = `${parent}:${rule.kind}`
        const value =
          explicit != null
            ? Number(explicit)
            : (parentCounters.get(counterKey) ?? 0) + 1
        parentCounters.set(counterKey, value)
        orderKey = `${parent}-${String(value).padStart(2, '0')}`
      } else if (rule.parentNumberGroup != null) {
        const counterKey = `${parent}:${rule.kind}`
        const next = (parentCounters.get(counterKey) ?? 0) + 1
        parentCounters.set(counterKey, next)
        orderKey = `${parent}-${String(next).padStart(2, '0')}`
      } else {
        // Legacy path (unchanged): counter keyed by kind alone, matching the
        // original boundariesForDeclarative before capture fields existed.
        const next = (parentCounters.get(rule.kind) ?? 0) + 1
        parentCounters.set(rule.kind, next)
        const isLegacyParentKind = /chapter|part|section|장/i.test(rule.kind)
        if (isLegacyParentKind) parent = String(next).padStart(2, '0')
        orderKey = isLegacyParentKind
          ? `${parent}-00`
          : `${parent}-${String(next).padStart(2, '0')}`
      }
      boundaries.push({ index, title, kind: rule.kind, orderKey })
      break
    }
  }
  if (boundaries.length === 0) {
    // Legacy path (unchanged): with no capture fields at all in play, fall
    // back to headings segmentation exactly as before.
    if (!rules.some((rule) => rule.fixedOrderKey || rule.parentNumberGroup))
      return boundariesForHeadings(lines)
    boundaries.unshift({
      index: 0,
      title: 'PREAMBLE',
      kind: 'preamble',
      orderKey: '00-00',
    })
  } else if (boundaries[0].index > 0) {
    if (boundaries[0].kind === 'preamble') {
      boundaries[0].index = 0
    } else {
      boundaries.unshift({
        index: 0,
        title: 'PREAMBLE',
        kind: 'preamble',
        orderKey: '00-00',
      })
    }
  }
  return boundaries
}

function splitOversizedUnit(
  unit: IndexUnit,
  lines: string[],
  maxTokens: number,
): IndexUnit[] {
  const body = lines.slice(unit.startLine - 1, unit.endLine).join('\n')
  if (estimateTokens(body) <= maxTokens) return [unit]
  const ranges: { start: number; end: number }[] = []
  let start = unit.startLine
  let buffer: string[] = []
  let htmlTable = false
  for (let line = unit.startLine; line <= unit.endLine; line += 1) {
    const text = lines[line - 1] ?? ''
    if (/<table\b/i.test(text)) htmlTable = true
    buffer.push(text)
    const safeBoundary =
      (!htmlTable && (text.trim() === '' || /^\s*\|/.test(text))) ||
      (htmlTable && /<\/tr>/i.test(text))
    if (safeBoundary && estimateTokens(buffer.join('\n')) >= maxTokens) {
      ranges.push({ start, end: line })
      start = line + 1
      buffer = []
    }
    if (/<\/table>/i.test(text)) htmlTable = false
  }
  if (start <= unit.endLine) ranges.push({ start, end: unit.endLine })
  if (ranges.length <= 1) return [unit]
  return ranges.map((range, index) => ({
    ...unit,
    orderKey: `${unit.orderKey}.${index + 1}`,
    startLine: range.start,
    endLine: range.end,
    part: { index: index + 1, total: ranges.length },
  }))
}

export function parseStructure(
  sources: IndexSource[],
  maxUnitTokens = 4000,
  fallbackMode: 'none' | 'chunks' = 'none',
  forcedProfile?: string,
  declarativeBoundaries?: DeclarativeBoundaryRule[],
): { units: IndexUnit[]; profile: string; warnings: string[] } {
  const ordered = orderSourceFiles(sources)
  if ('error' in ordered) throw new Error(ordered.error)

  let profileName = forcedProfile
  let detected = null

  // A3: when the caller supplies declarativeBoundaries, honor them
  // unconditionally - skip auto-detection and the legal-numbered/treaty
  // "not found" throw entirely. Previously this branch ran regardless of
  // declarativeBoundaries, so a workflow-declared profile could never reach
  // the declarative path below (388) if detectBoundaryProfile happened to
  // fail on the same document.
  if (
    !declarativeBoundaries?.length &&
    (!profileName ||
      profileName === 'legal-numbered' ||
      profileName === 'treaty')
  ) {
    detected = detectBoundaryProfile(
      ordered.ordered.flatMap((source) => source.lines),
    )
    if (detected) {
      profileName = 'legal-numbered'
    } else if (profileName === 'legal-numbered' || profileName === 'treaty') {
      throw new Error(
        L({
          ko: 'legal-numbered 경계(Article/제N조/ANNEX 줄)를 찾지 못했습니다. structure_profile을 headings 또는 token_chunks로 주십시오.',
          en: 'No legal-numbered boundaries (Article/Korean numbered article/ANNEX lines) found. Set structure_profile to headings or token_chunks.',
        }),
      )
    }
  }

  if (!profileName && fallbackMode === 'none') {
    throw new Error(
      L({
        ko: '경계를 찾지 못했습니다. preview=true로 확인하거나 structure_profile="token_chunks"를 사용하세요.',
        en: 'No boundaries found. Check with preview=true or use structure_profile="token_chunks".',
      }),
    )
  }

  const useProfile = profileName || 'chunks'
  const units: IndexUnit[] = []
  const usedOrderKeys = new Map<string, number>()
  const uniqueOrderKey = (unit: IndexUnit): IndexUnit => {
    const previous = usedOrderKeys.get(unit.orderKey) ?? 0
    if (previous === 0) {
      usedOrderKeys.set(unit.orderKey, 1)
      return unit
    }
    let next = previous + 1
    let candidate = `${unit.orderKey}.${next}`
    while (usedOrderKeys.has(candidate)) {
      next += 1
      candidate = `${unit.orderKey}.${next}`
    }
    usedOrderKeys.set(unit.orderKey, next)
    usedOrderKeys.set(candidate, 1)
    ordered.warnings.push(
      L({
        ko: `${unit.sourcePath}: 중복 orderKey ${unit.orderKey}를 ${candidate}로 보정했습니다.`,
        en: `${unit.sourcePath}: Duplicate orderKey ${unit.orderKey} adjusted to ${candidate}.`,
      }),
    )
    return { ...unit, orderKey: candidate }
  }

  for (const source of ordered.ordered) {
    const stripped = stripLeadingFrontmatter(source.lines)
    const sourceLines = stripped.lines

    if (
      useProfile === 'chunks' ||
      useProfile === 'token_chunks' ||
      useProfile === 'token-chunks'
    ) {
      let start = 0
      let index = 1
      while (start < sourceLines.length) {
        let end = start
        while (
          end + 1 < sourceLines.length &&
          (estimateTokens(sourceLines.slice(start, end + 2).join('\n')) <
            maxUnitTokens ||
            sourceLines[end + 1].trim() !== '')
        )
          end += 1
        units.push(
          uniqueOrderKey({
            kind: 'chunk',
            orderKey: `S-${String(index).padStart(4, '0')}`,
            title: `Section ${index}`,
            sourcePath: source.path,
            startLine: start + 1 + stripped.offset,
            endLine: end + 1 + stripped.offset,
          }),
        )
        start = end + 1
        index += 1
      }
      continue
    }

    const boundaries = declarativeBoundaries?.length
      ? boundariesForDeclarative(sourceLines, declarativeBoundaries)
      : useProfile === 'headings'
        ? boundariesForHeadings(sourceLines)
        : boundariesForLegalNumbered(sourceLines)

    for (let index = 0; index < boundaries.length; index += 1) {
      const boundary = boundaries[index]
      const unit: IndexUnit = {
        kind: boundary.kind,
        orderKey: boundary.orderKey,
        title: boundary.title,
        sourcePath: source.path,
        startLine: boundary.index + 1 + stripped.offset,
        endLine:
          (boundaries[index + 1]?.index ?? sourceLines.length) +
          stripped.offset,
      }
      units.push(
        ...splitOversizedUnit(unit, source.lines, maxUnitTokens).map(
          uniqueOrderKey,
        ),
      )
    }
  }

  return {
    units: units.filter(
      (unit, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.sourcePath === unit.sourcePath &&
            candidate.startLine === unit.startLine &&
            candidate.orderKey === unit.orderKey,
        ) === index,
    ),
    profile: useProfile,
    warnings: ordered.warnings,
  }
}
