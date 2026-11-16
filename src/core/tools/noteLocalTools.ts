import { TFile, normalizePath } from 'obsidian'

import { L } from '../../i18n/modelText'
import { noteFormat } from '../../i18n/noteFormats'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { citationLink, createSourceCitation } from '../../utils/sourceCitation'
import {
  ResolvedLinks,
  backlinks,
  collectTagIndex,
  incomingUnlinkedMentions,
  outgoingUnlinkedMentions,
} from '../../utils/vault-relations'

import { executeDocumentRead } from './documentReadTools'
import {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
  changeHelper,
  formatToolRequestEntry,
  readToolText,
  resolveFile,
  semanticAvailabilityFact,
  semanticFactText,
  str,
  toolRequestKey,
} from './localToolCommon'
import {
  availableHeadingNames,
  headingPathForLine,
  matchHeadingOccurrences,
  parseHeadings,
  renderLines,
  searchLines,
  sectionEndLine,
  sectionsByPatternWithAutoFallback,
  selectHeadingOccurrence,
  splitLines,
} from './noteSlicing'
import { unsupportedTextRead } from './sourceReadHint'

const MAX_RANGE_LINES = 400
const MAX_SECTION_CHARS = 24_000
const MAX_AROUND_CONTEXT = 200
const DEFAULT_OUTLINE_PAGE_SIZE = 80
const MAX_OUTLINE_PAGE_SIZE = 200
const OUTLINE_TOKEN_BUDGET_RATIO = 0.1
const MAX_OUTLINE_TOKEN_BUDGET = 4_000
const DEFAULT_FILE_SEARCH_PAGE_SIZE = 50
const MAX_FILE_SEARCH_PAGE_SIZE = 200
const MAX_FILE_SEARCH_CONTEXT = 5
const MAX_FILE_SEARCH_OUTPUT_CHARS = 8_000
const MAX_MENTION_SCAN_FILES = 1000

async function sourceLink(
  path: string,
  content: string,
  start: number,
  end: number,
): Promise<string> {
  const excerpt = splitLines(content)
    .slice(start - 1, end)
    .join('\n')
  const citation = await createSourceCitation(
    normalizePath(path),
    content,
    start,
    end,
    excerpt,
  )
  return citation
    ? L({
        ko: `\n출처 링크: ${citationLink(citation)}`,
        en: `\nSource link: ${citationLink(citation)}`,
      })
    : ''
}

export async function executeNoteTool(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const documentRead = await executeDocumentRead(tool, args, ctx)
  if (documentRead) return documentRead
  const fileForPath = (path: string): TFile | null => {
    return resolveFile(path, ctx, ['md', 'base'])
  }
  const readContent = async (path: string): Promise<string | null> => {
    return readToolText(path, ctx)
  }
  const noteNames = (file: TFile): string[] => {
    const names = [file.basename]
    const aliases: unknown =
      ctx.app.metadataCache?.getFileCache?.(file)?.frontmatter?.aliases
    if (Array.isArray(aliases)) names.push(...aliases.map(String))
    else if (typeof aliases === 'string') names.push(aliases)
    return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  }
  switch (tool) {
    case 'find_unlinked_mentions': {
      const path = str(args, 'path')
      if (!path)
        return {
          kind: 'error',
          message: 'find_unlinked_mentions requires "path".',
        }
      const target = fileForPath(normalizePath(path))
      if (!target)
        return {
          kind: 'read',
          text: L({
            ko: `(노트를 찾지 못했습니다: ${path})`,
            en: `(Note not found: ${path})`,
          }),
        }
      // Link maps are keyed by the resolved file path, not the requested one.
      const normalized = target.path
      const limit =
        typeof args.limit === 'number' && args.limit > 0
          ? Math.floor(args.limit)
          : 20

      const targetBody = await ctx.app.vault.cachedRead(target)
      const targetNames = noteNames(target)

      const resolvedLinks: ResolvedLinks =
        ctx.app.metadataCache?.resolvedLinks ?? {}
      const outLinked = new Set(Object.keys(resolvedLinks[normalized] ?? {}))
      const linkedToTarget = new Set(
        backlinks(resolvedLinks, normalized).map((ref) => ref.path),
      )

      const candidates = ctx.app.vault
        .getMarkdownFiles()
        .filter((file) => file.path !== normalized)
        .filter((file) => !file.path.startsWith('.verbex'))
        .sort((a, b) => a.path.localeCompare(b.path))
      const scanned = candidates.slice(0, MAX_MENTION_SCAN_FILES)
      const truncated = candidates.length > scanned.length

      const outCandidates: { path: string; names: string[] }[] = []
      const inCandidates: { path: string; text: string }[] = []
      for (const file of scanned) {
        if (!outLinked.has(file.path)) {
          const names = noteNames(file)
          if (names.length > 0) outCandidates.push({ path: file.path, names })
        }
        if (!linkedToTarget.has(file.path)) {
          inCandidates.push({
            path: file.path,
            text: await ctx.app.vault.cachedRead(file),
          })
        }
      }

      const incoming = incomingUnlinkedMentions(
        targetNames,
        inCandidates,
        new Set(),
      )
      const outgoing = outgoingUnlinkedMentions(
        targetBody,
        outCandidates,
        new Set(),
      )

      const incomingPage = incoming.slice(0, limit)
      const outgoingPage = outgoing.slice(0, limit)
      const count = (shown: number, total: number): string =>
        shown < total ? `${shown} of ${total}` : `${shown}`

      const fmt = (refs: { path: string; count: number }[]): string =>
        refs.length > 0
          ? refs
              .map((ref) =>
                L({
                  ko: `${ref.path} (${ref.count}회 언급)`,
                  en: `${ref.path} (${ref.count} mentions)`,
                }),
              )
              .join('\n')
          : L({ ko: '(없음)', en: '(none)' })

      const lines = [
        L({
          ko: `미링크 언급 — ${normalized} (이름: ${targetNames.join(', ')})`,
          en: `Unlinked mentions — ${normalized} (names: ${targetNames.join(', ')})`,
        }),
        '',
        L({
          ko: `## 이 노트를 언급했지만 링크하지 않은 노트 (${count(incomingPage.length, incoming.length)})`,
          en: `## Notes mentioning this note without linking to it (${count(incomingPage.length, incoming.length)})`,
        }),
        fmt(incomingPage),
        '',
        L({
          ko: `## 이 노트가 언급했지만 링크하지 않은 노트 (${count(outgoingPage.length, outgoing.length)})`,
          en: `## Notes mentioned by this note without links (${count(outgoingPage.length, outgoing.length)})`,
        }),
        fmt(outgoingPage),
        '',
        L({
          ko: '필요하다고 판단되는 노트는 read_file / read_note_section 으로 직접 읽어 확인하세요. 이미 링크된 노트(아웃링크)와 백링크는 note_context 로 함께 확인할 수 있습니다.',
          en: 'Read relevant notes directly with read_file / read_note_section to verify them. Use note_context to inspect existing outgoing links and backlinks together.',
        }),
      ]
      if (truncated)
        lines.push(
          L({
            ko: `(주의: 노트가 많아 경로 앞쪽 ${MAX_MENTION_SCAN_FILES}개만 스캔했습니다.)`,
            en: `(Warning: there are many notes; only the first ${MAX_MENTION_SCAN_FILES} in path order were scanned.)`,
          }),
        )
      return { kind: 'read', text: lines.join('\n') }
    }

    case 'note_outline': {
      const path = str(args, 'path')
      if (!path)
        return { kind: 'error', message: 'note_outline requires "path".' }
      const content = await readContent(path)
      if (content === null)
        return {
          kind: 'error',
          message:
            (await unsupportedTextRead(path, ctx)) ?? `File not found: ${path}`,
        }

      const lines = splitLines(content)
      const totalLines = lines.length
      const headings = parseHeadings(lines)
      const offsetValue = args.offset === undefined ? 0 : Number(args.offset)
      const limitValue =
        args.limit === undefined
          ? DEFAULT_OUTLINE_PAGE_SIZE
          : Number(args.limit)
      if (!Number.isInteger(offsetValue) || offsetValue < 0) {
        return {
          kind: 'error',
          message: 'note_outline offset must be a non-negative integer.',
        }
      }
      if (!Number.isInteger(limitValue) || limitValue < 1) {
        return {
          kind: 'error',
          message: 'note_outline limit must be a positive integer.',
        }
      }
      const offset = offsetValue
      const limit = Math.min(limitValue, MAX_OUTLINE_PAGE_SIZE)

      const header = `${path} — ${totalLines} lines, ${content.length} chars, ~${estimateTokens(content)} tokens`
      if (headings.length === 0) {
        return {
          kind: 'read',
          text: `${header}\n(no headings — use read_note_lines with the line counts above)`,
        }
      }

      if (offset >= headings.length) {
        return {
          kind: 'read',
          text: `${header}\nOutline complete: offset ${offset} is at or past ${headings.length} headings.`,
        }
      }

      const outputBudget = Math.max(
        256,
        Math.min(
          MAX_OUTLINE_TOKEN_BUDGET,
          Math.floor(ctx.getContextBudget() * OUTLINE_TOKEN_BUDGET_RATIO),
        ),
      )
      const entries: string[] = []
      let usedTokens = estimateTokens(header)
      for (
        let index = offset;
        index < headings.length && entries.length < limit;
        index++
      ) {
        const h = headings[index]
        const end = sectionEndLine(headings, index, totalLines, true)
        const body = lines.slice(h.line - 1, end).join('\n')
        const indent = '  '.repeat(Math.max(0, h.level - 1))
        const entry = `${indent}- L${h.line} ${'#'.repeat(h.level)} ${h.heading} — lines ${h.line}-${end} (~${estimateTokens(body)} tok)`
        const entryTokens = estimateTokens(entry)
        if (entries.length > 0 && usedTokens + entryTokens > outputBudget) break
        entries.push(entry)
        usedTokens += entryTokens
      }
      const nextOffset = offset + entries.length
      const page = `Outline headings ${offset + 1}-${nextOffset} of ${headings.length}`
      const continuation =
        nextOffset < headings.length
          ? `next=note_outline path="${path}" offset=${nextOffset} limit=${limit}`
          : 'Outline complete.'
      const outline = entries.join('\n')
      return {
        kind: 'read',
        text: `${header}\n${page}\n${outline}\n${continuation}`,
      }
    }

    case 'search_in_file': {
      const path = str(args, 'path')
      const pattern = str(args, 'pattern')
      if (!path || !pattern) {
        return {
          kind: 'error',
          message: 'search_in_file requires "path" and "pattern".',
        }
      }
      const offset = args.offset === undefined ? 0 : Number(args.offset)
      const requestedLimit =
        args.max_matches === undefined
          ? DEFAULT_FILE_SEARCH_PAGE_SIZE
          : Number(args.max_matches)
      const requestedContext =
        args.context_lines === undefined ? 0 : Number(args.context_lines)
      if (!Number.isInteger(offset) || offset < 0) {
        return {
          kind: 'error',
          message: 'search_in_file offset must be a non-negative integer.',
        }
      }
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
        return {
          kind: 'error',
          message: 'search_in_file max_matches must be a positive integer.',
        }
      }
      if (!Number.isInteger(requestedContext) || requestedContext < 0) {
        return {
          kind: 'error',
          message:
            'search_in_file context_lines must be a non-negative integer.',
        }
      }
      const content = await readContent(path)
      if (content === null)
        return {
          kind: 'error',
          message:
            (await unsupportedTextRead(path, ctx)) ?? `File not found: ${path}`,
        }

      const lines = splitLines(content)
      const result = searchLines(lines, pattern, args.case_sensitive === true)
      const limit = Math.min(requestedLimit, MAX_FILE_SEARCH_PAGE_SIZE)
      const contextLines = Math.min(requestedContext, MAX_FILE_SEARCH_CONTEXT)
      if (offset >= result.matches.length) {
        return {
          kind: 'read',
          text: [
            `${path}: ${JSON.stringify(pattern)} — ${result.totalMatches} occurrence(s) on ${result.matches.length} matching line(s).`,
            result.usedLiteralFallback
              ? '(Invalid regular expression; used literal text search instead.)'
              : '',
            'Search complete.',
          ]
            .filter(Boolean)
            .join('\n'),
        }
      }

      const header = [
        `${path}: ${JSON.stringify(pattern)} — ${result.totalMatches} occurrence(s) on ${result.matches.length} matching line(s)`,
        result.usedLiteralFallback
          ? '(Invalid regular expression; used literal text search instead.)'
          : '',
      ].filter(Boolean)
      const entries: string[] = []
      for (
        let index = offset;
        index < result.matches.length && entries.length < limit;
        index += 1
      ) {
        const match = result.matches[index]
        const breadcrumb =
          match.headingPath.length > 0
            ? `[${match.headingPath.join(' > ')}]`
            : '[]'
        const occurrenceNote =
          match.occurrences > 1 ? ` (${match.occurrences} matches)` : ''
        const parts = [
          `L${match.line}\t${breadcrumb}\t${match.text}${occurrenceNote}`,
        ]
        if (contextLines > 0) {
          const start = Math.max(1, match.line - contextLines)
          const end = Math.min(lines.length, match.line + contextLines)
          for (let line = start; line <= end; line += 1) {
            if (line === match.line) continue
            parts.push(`  L${line}\t${lines[line - 1] ?? ''}`)
          }
        }
        const entry = parts.join('\n')
        const projected = [...header, ...entries, entry].join('\n').length
        if (entries.length > 0 && projected > MAX_FILE_SEARCH_OUTPUT_CHARS) {
          break
        }
        entries.push(entry)
      }
      const nextOffset = offset + entries.length
      const continuation =
        nextOffset < result.matches.length
          ? `next=search_in_file path=${JSON.stringify(path)} pattern=${JSON.stringify(pattern)} offset=${nextOffset} max_matches=${limit}`
          : 'Search complete.'
      return {
        kind: 'read',
        text: [
          ...header,
          `Matching lines ${offset + 1}-${nextOffset} of ${result.matches.length}`,
          ...entries,
          `next=read_note_around path=${JSON.stringify(path)} line=<L>`,
          continuation,
        ].join('\n'),
      }
    }

    case 'note_outline_by_pattern': {
      const path = str(args, 'path')
      const pattern = str(args, 'pattern')
      if (!path || !pattern) {
        return {
          kind: 'error',
          message: 'note_outline_by_pattern requires "path" and "pattern".',
        }
      }
      const offset = args.offset === undefined ? 0 : Number(args.offset)
      const requestedLimit =
        args.limit === undefined
          ? DEFAULT_OUTLINE_PAGE_SIZE
          : Number(args.limit)
      if (!Number.isInteger(offset) || offset < 0) {
        return {
          kind: 'error',
          message:
            'note_outline_by_pattern offset must be a non-negative integer.',
        }
      }
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
        return {
          kind: 'error',
          message: 'note_outline_by_pattern limit must be a positive integer.',
        }
      }
      const content = await readContent(path)
      if (content === null)
        return {
          kind: 'error',
          message:
            (await unsupportedTextRead(path, ctx)) ?? `File not found: ${path}`,
        }
      const lines = splitLines(content)
      const result = sectionsByPatternWithAutoFallback(lines, pattern)
      const limit = Math.min(requestedLimit, MAX_OUTLINE_PAGE_SIZE)
      const header = `${path} — ${lines.length} lines, ${content.length} chars, ~${estimateTokens(content)} tokens`
      if (result.sections.length === 0) {
        return {
          kind: 'read',
          text: `${header}\n(no matching section boundaries — refine the pattern with search_in_file)`,
        }
      }
      if (offset >= result.sections.length) {
        return {
          kind: 'read',
          text: `${header}\nPattern outline complete: offset ${offset} is at or past ${result.sections.length} sections.`,
        }
      }
      const entries = result.sections
        .slice(offset, offset + limit)
        .map((section) => {
          const body = lines
            .slice(section.startLine - 1, section.endLine)
            .join('\n')
          return `- L${section.startLine} ${section.title} — lines ${section.startLine}-${section.endLine} (~${estimateTokens(body)} tok)`
        })
      const nextOffset = offset + entries.length
      const continuation =
        nextOffset < result.sections.length
          ? `next=note_outline_by_pattern path=${JSON.stringify(path)} pattern=${JSON.stringify(result.effectivePattern)} offset=${nextOffset} limit=${limit}`
          : 'Pattern outline complete.'
      return {
        kind: 'read',
        text: [
          header,
          result.usedLiteralFallback
            ? '(Invalid regular expression; used literal text search instead.)'
            : '',
          result.usedAutoDetectedPattern
            ? `(The supplied pattern matched no boundaries; automatically detected document-level pattern ${JSON.stringify(result.effectivePattern)}.)`
            : '',
          `Pattern sections ${offset + 1}-${nextOffset} of ${result.sections.length}`,
          ...entries,
          continuation,
        ]
          .filter(Boolean)
          .join('\n'),
      }
    }

    case 'read_note_lines': {
      const path = str(args, 'path')
      if (!path)
        return { kind: 'error', message: 'read_note_lines requires "path".' }
      const start = Number(args.start_line)
      const end = Number(args.end_line)
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1)
        return {
          kind: 'error',
          message:
            'read_note_lines requires positive integer start_line/end_line (1-based).',
        }
      if (end < start)
        return { kind: 'error', message: 'end_line must be >= start_line.' }
      const includeLineNumbers = args.include_line_numbers !== false

      const content = await readContent(path)
      if (content === null)
        return {
          kind: 'error',
          message:
            (await unsupportedTextRead(path, ctx)) ?? `File not found: ${path}`,
        }

      const lines = splitLines(content)
      const totalLines = lines.length
      if (start > totalLines)
        return {
          kind: 'error',
          message: `start_line ${start} is past end of note (${totalLines} lines).`,
        }
      const clampedEnd = Math.min(end, totalLines)
      const cappedEnd = Math.min(clampedEnd, start + MAX_RANGE_LINES - 1)
      const truncated = cappedEnd < clampedEnd
      const headingPath = headingPathForLine(parseHeadings(lines), start)

      const head =
        `${path} lines ${start}-${cappedEnd} of ${totalLines}` +
        (headingPath.length > 0 ? ` · ${headingPath.join(' > ')}` : '')
      const body = renderLines(lines, start, cappedEnd, includeLineNumbers)
      const note = truncated
        ? `\n\n[Truncated at ${MAX_RANGE_LINES} lines. Continue with read_note_lines start_line=${cappedEnd + 1} end_line=${clampedEnd}]`
        : ''
      return {
        kind: 'read',
        text: `${head}${await sourceLink(path, content, start, cappedEnd)}\n\n${body}${note}`,
      }
    }

    case 'read_note_section': {
      const path = str(args, 'path')
      if (!path)
        return { kind: 'error', message: 'read_note_section requires "path".' }
      const headingArg = str(args, 'heading')
      if (!headingArg)
        return {
          kind: 'error',
          message: 'read_note_section requires "heading".',
        }
      const occurrence =
        Number.isInteger(Number(args.occurrence)) && Number(args.occurrence) > 0
          ? Number(args.occurrence)
          : 1
      const includeSubsections = args.include_subsections !== false

      const content = await readContent(path)
      if (content === null)
        return {
          kind: 'error',
          message:
            (await unsupportedTextRead(path, ctx)) ?? `File not found: ${path}`,
        }

      const lines = splitLines(content)
      const headings = parseHeadings(lines)
      const matches = matchHeadingOccurrences(headings, headingArg)
      if (matches.length === 0) {
        const available = availableHeadingNames(headings)
          .map((heading) => `"${heading}"`)
          .join(', ')
        return {
          kind: 'read',
          text: `(Section not found: "${headingArg}". Available headings: ${available || 'none'})`,
        }
      }
      if (occurrence > matches.length)
        return {
          kind: 'error',
          message: `occurrence ${occurrence} requested but "${headingArg}" appears only ${matches.length} time(s).`,
        }
      const selected = selectHeadingOccurrence(matches, occurrence)
      if (!selected)
        return {
          kind: 'error',
          message: `occurrence ${occurrence} must be a positive integer.`,
        }
      const { heading: h, index: idx } = selected
      const endLine = sectionEndLine(
        headings,
        idx,
        lines.length,
        includeSubsections,
      )

      let sectionText = lines.slice(h.line - 1, endLine).join('\n')
      let truncated = false
      if (sectionText.length > MAX_SECTION_CHARS) {
        sectionText = sectionText.slice(0, MAX_SECTION_CHARS)
        truncated = true
      }
      const headingPath = headingPathForLine(headings, h.line)
      const head = `${path} lines ${h.line}-${endLine} · ${headingPath.join(' > ')}`
      const note = truncated
        ? `\n\n[Truncated at ${MAX_SECTION_CHARS} chars. Read the rest with read_note_lines start_line=${h.line} end_line=${endLine}]`
        : ''
      const citedEnd = Math.min(
        endLine,
        h.line + splitLines(sectionText).length - 1,
      )
      return {
        kind: 'read',
        text: `${head}${await sourceLink(path, content, h.line, citedEnd)}\n\n${sectionText}${note}`,
      }
    }

    case 'read_note_around': {
      const path = str(args, 'path')
      if (!path)
        return { kind: 'error', message: 'read_note_around requires "path".' }
      const anchor = Number(args.line)
      if (!Number.isInteger(anchor) || anchor < 1)
        return {
          kind: 'error',
          message:
            'read_note_around requires a positive integer "line" (1-based).',
        }
      const before = Math.min(
        Number.isInteger(Number(args.before)) ? Number(args.before) : 20,
        MAX_AROUND_CONTEXT,
      )
      const after = Math.min(
        Number.isInteger(Number(args.after)) ? Number(args.after) : 20,
        MAX_AROUND_CONTEXT,
      )

      const content = await readContent(path)
      if (content === null)
        return {
          kind: 'error',
          message:
            (await unsupportedTextRead(path, ctx)) ?? `File not found: ${path}`,
        }

      const lines = splitLines(content)
      const totalLines = lines.length
      if (anchor > totalLines)
        return {
          kind: 'error',
          message: `line ${anchor} is past end of note (${totalLines} lines).`,
        }
      const start = Math.max(1, anchor - before)
      const end = Math.min(totalLines, anchor + after)
      const headingPath = headingPathForLine(parseHeadings(lines), anchor)
      const head =
        `${path} lines ${start}-${end} of ${totalLines} (anchor ${anchor})` +
        (headingPath.length > 0 ? ` · ${headingPath.join(' > ')}` : '')
      const body = renderLines(lines, start, end, true)
      return {
        kind: 'read',
        text: `${head}${await sourceLink(path, content, start, end)}\n\n${body}`,
      }
    }

    case 'extract_to_file': {
      const sourcePath = str(args, 'source_path')
      const newPath = str(args, 'new_path')
      if (!sourcePath || !newPath)
        return {
          kind: 'error',
          message: 'extract_to_file requires "source_path" and "new_path".',
        }
      const start = Number(args.start_line)
      const end = Number(args.end_line)
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1)
        return {
          kind: 'error',
          message:
            'extract_to_file requires positive integer start_line/end_line (1-based).',
        }
      if (end < start)
        return { kind: 'error', message: 'end_line must be >= start_line.' }

      const normalizedNew = normalizePath(newPath)
      if (!normalizedNew.endsWith('.md'))
        return {
          kind: 'error',
          message: 'extract_to_file new_path must end in .md.',
        }
      const normalizedSource = normalizePath(sourcePath)
      if (normalizedSource === normalizedNew)
        return {
          kind: 'error',
          message: 'extract_to_file new_path must differ from source_path.',
        }

      if (await ctx.app.vault.adapter.exists(normalizedNew))
        return {
          kind: 'error',
          message: `Destination already exists: ${newPath}`,
        }

      const content = await readToolText(normalizedSource, ctx, ['md', 'base'])
      if (content === null)
        return {
          kind: 'error',
          message: `Source file not found: ${sourcePath}`,
        }
      const lines = splitLines(content)
      if (start > lines.length)
        return {
          kind: 'error',
          message: `start_line ${start} is past end of source (${lines.length} lines).`,
        }
      const clampedEnd = Math.min(end, lines.length)
      const slice = lines.slice(start - 1, clampedEnd).join('\n')

      return changeHelper('extract_to_file', {
        op: 'create',
        kind: 'create',
        path: normalizedNew,
        before: null,
        after: slice,
      })
    }

    case 'list_tags': {
      const limit =
        typeof args.limit === 'number' && args.limit > 0
          ? Math.floor(args.limit)
          : 100
      const index = collectTagIndex(ctx.app)
      const entries = [...index.entries()].sort(
        ([a, pa], [b, pb]) => pb.length - pa.length || a.localeCompare(b),
      )
      if (entries.length === 0) return { kind: 'read', text: '(no tags)' }
      const lines = entries
        .slice(0, limit)
        .map(([tag, paths]) => `#${tag}\t${paths.length}`)
      const omitted =
        entries.length > limit
          ? `\n... omitted ${entries.length - limit} tag(s)`
          : ''
      return { kind: 'read', text: `${lines.join('\n')}${omitted}` }
    }

    case 'find_by_tag': {
      const tagArg = str(args, 'tag')
      if (!tagArg)
        return { kind: 'error', message: 'find_by_tag requires "tag".' }
      const tag = tagArg.replace(/^#/, '').trim()
      const limit =
        typeof args.limit === 'number' && args.limit > 0
          ? Math.floor(args.limit)
          : 100
      const paths = collectTagIndex(ctx.app).get(tag) ?? []
      if (paths.length === 0)
        return { kind: 'read', text: `(no notes tagged #${tag})` }
      const sorted = [...paths].sort()
      const folders = new Map<string, number>()
      for (const path of paths) {
        const folder = path.includes('/')
          ? path.split('/')[0]
          : L({ ko: '(루트)', en: '(root)' })
        folders.set(folder, (folders.get(folder) ?? 0) + 1)
      }
      const counts = [...folders].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'),
      )
      const folderSummary = counts
        .slice(0, 12)
        .map(([name, count]) => `${name} ${count}`)
      if (counts.length > 12)
        folderSummary.push(
          L({
            ko: `외 ${counts.length - 12}개 폴더 ${counts.slice(12).reduce((sum, [, count]) => sum + count, 0)}개`,
            en: `${counts.slice(12).reduce((sum, [, count]) => sum + count, 0)} notes in ${counts.length - 12} other folders`,
          }),
        )
      const omitted =
        sorted.length > limit
          ? `\n... omitted ${sorted.length - limit} note(s)`
          : ''
      return {
        kind: 'read',
        text: L({
          ko: `#${tag} — ${sorted.length}개 노트\n최상위 폴더별 노트 수: ${folderSummary.join(', ')}\n${sorted.slice(0, limit).join('\n')}${omitted}`,
          en: `#${tag} — ${sorted.length} notes\nNote counts by top-level folder: ${folderSummary.join(', ')}\n${sorted.slice(0, limit).join('\n')}${omitted}`,
        }),
      }
    }

    case 'semantic_search': {
      const query = str(args, 'query')
      if (!query)
        return { kind: 'error', message: 'semantic_search requires "query".' }
      if (!ctx.getSemanticProvider) {
        return {
          kind: 'read',
          text: '(semantic search provider is not configured)',
        }
      }
      const limit =
        typeof args.limit === 'number' && args.limit > 0
          ? Math.floor(args.limit)
          : 10
      const provider = await ctx.getSemanticProvider()
      if (!provider) {
        const fact = semanticAvailabilityFact(ctx)
        return {
          kind: 'read',
          text: fact
            ? L({
                ko: `(의미 검색을 쓸 수 없습니다: ${semanticFactText()[fact]})`,
                en: `(Semantic search is unavailable: ${semanticFactText()[fact]})`,
              })
            : '(semantic search provider is not available)',
        }
      }
      const results = await provider.processQuery({ query })
      if (results.length === 0) {
        return {
          kind: 'read',
          text: L({
            ko: `(의미 검색 "${query}"에 해당하는 노트가 없습니다)`,
            en: `(No notes matched semantic search "${query}")`,
          }),
        }
      }
      const ranked = [...results].sort((a, b) => b.similarity - a.similarity)
      const best = ranked[0].similarity
      const gated = ranked
      const header = L({
        ko: `의미 검색 "${query}" — ${gated.length}개 결과(유사도 순, 최고 ${best.toFixed(2)}).`,
        en: `Semantic search "${query}" — ${gated.length} results (by similarity, highest ${best.toFixed(2)}).`,
      })
      return {
        kind: 'read',
        text: `${header}\n${gated
          .slice(0, limit)
          .map(
            (result) =>
              `${result.path}\tsimilarity=${result.similarity.toFixed(3)}\t${result.content.replace(/\s+/g, ' ').trim().slice(0, 240)}`,
          )
          .join('\n')}`,
      }
    }

    case 'request_tool': {
      const rawName = str(args, 'name')
      const purpose = str(args, 'purpose')
      if (!rawName || !purpose) {
        return {
          kind: 'error',
          message: L({
            ko: 'request_tool에는 최소한 name(제안 도구 이름)과 purpose(필요한 기능)가 필요합니다.',
            en: 'request_tool requires at least name (proposed tool name) and purpose (required functionality).',
          }),
        }
      }
      const name = rawName.trim().replace(/\s+/g, '_').toLowerCase()
      const input = {
        name,
        purpose,
        whyInsufficient: str(args, 'why_insufficient'),
        example: str(args, 'example'),
        inputs: str(args, 'inputs'),
        outputs: str(args, 'outputs'),
        at: new Date(),
      }
      const path = normalizePath(ctx.getToolRequestLogPath())
      try {
        const adapter = ctx.app.vault.adapter
        const slash = path.lastIndexOf('/')
        if (slash > 0) {
          const folder = path.slice(0, slash)
          if (!(await adapter.exists(folder))) {
            await adapter.mkdir(folder)
          }
        }
        const exists = await adapter.exists(path)
        const current = exists
          ? await adapter.read(path)
          : `${noteFormat('requestTitle')}\n\n`
        const key = toolRequestKey(name, input.purpose)
        if (current.includes(`verbex-tool-request: ${key}`)) {
          return {
            kind: 'read',
            text: L({
              ko: `같은 요청("${name}")이 이미 ${path}에 있어 중복 기록은 생략했습니다.\n이 호출은 개발자에게 도구 개발을 "요청"한 것일 뿐, "${name}" 도구가 지금 만들어지지는 않습니다.`,
              en: `The same request ("${name}") already exists in ${path}; the duplicate entry was skipped.\nThis call only "requests" tool development from the developer; it does not create the "${name}" tool now.`,
            }),
          }
        }
        const nextContent = `${current.trimEnd()}\n\n${formatToolRequestEntry(input, current)}\n`
        // A tool request is a policy-visible Vault write, not a read. Return a
        // proposal so the normal permission → approval → checkpoint → apply
        // pipeline owns the mutation (the old implementation wrote directly).
        return changeHelper('request_tool', {
          op: exists ? 'modify' : 'create',
          kind: exists ? 'body' : 'create',
          path,
          before: exists ? current : null,
          after: nextContent,
        })
      } catch (error) {
        return {
          kind: 'error',
          message: L({
            ko: `도구 요청 기록 실패: ${error instanceof Error ? error.message : String(error)}`,
            en: `Failed to record tool request: ${error instanceof Error ? error.message : String(error)}`,
          }),
        }
      }
    }
    default:
      return { kind: 'error', message: `Unknown note tool: ${tool}` }
  }
}
