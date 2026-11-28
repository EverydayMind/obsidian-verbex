import { TFile, normalizePath, parseYaml, stringifyYaml } from 'obsidian'

import { t } from '../../i18n'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import { assertNotAiPrivate } from '../../security/aiPrivateRefusal'
import {
  assertUserVaultPath,
  normalizeVaultPathKey,
} from '../../security/vaultPathPolicy'
import { resolveFolders } from '../../utils/folder-search'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { cachedLinkTargets } from '../../utils/vault-relations'
import { executeRenderBaseTool } from '../obsidian-core/renderBaseTool'
import { isDocumentPath } from '../rag/documentSources/indexableSources'
import { SourceTextReader } from '../rag/sourceTextReader'
import { linkUpdateNotes, linkerEntries } from '../tidy/tidyLocalTools'
import { backlinkers, folderOf } from '../tidy/tidyVault'

import { appendFileContent, toCrlf } from './appendFileContent'
import { readFiles } from './documentFileReads'
import { boundActiveContent, boundFrontmatter } from './fileActiveBounds'
import { executeFileCompositionTool } from './fileComposition'
import { executeFileListing, listedFiles } from './fileListing'
import * as fileText from './fileLocalToolsText'
import { missingMutationFile } from './fileMutationError'
import {
  FRONTMATTER_RE,
  READABLE_TEXT_EXTENSIONS,
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
  changeHelper,
  extractLinks,
  readToolText,
  renderOfferHint,
  resolveFile,
  str,
} from './localToolCommon'
import { readMutationTarget } from './mutationTargetPath'
import {
  availableHeadingNames,
  matchHeadingOccurrences,
  parseHeadings,
  sectionEndLine,
  selectHeadingOccurrence,
  splitLines,
} from './noteSlicing'
import { pageNumber, queryProperty } from './propertyQuery'
import { relatedBaseViews } from './relatedBases'
import { sourceReadHint, unsupportedTextRead } from './sourceReadHint'
import { unreadDocumentText } from './unreadDocumentText'

const MAX_RANGE_LINES = 400
const READ_FILE_SAFETY_RATIO = 0.35
const MAX_READ_FILE_OUTLINE_HEADINGS = 80
const MAX_OVERSIZED_FOLDER_OUTLINE_HEADINGS = 80
const MAX_ACTIVE_OUTLINE_HEADINGS = 80
const MAX_ACTIVE_HEADING_CHARS = 256

function hasBasenameExtension(normalizedPath: string): boolean {
  const basename = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1)
  const dot = basename.lastIndexOf('.')
  if (dot <= 0 || dot === basename.length - 1) return false
  return !/\s/.test(basename.slice(dot + 1))
}

export async function executeFileTool(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const fileForPath = (path: string): TFile | null => {
    return resolveFile(path, ctx, ['md', 'base'])
  }

  const readContent = async (path: string): Promise<string | null> => {
    return readToolText(path, ctx)
  }

  const formatOversizedFolderFile = (
    file: TFile,
    content: string,
    budget: number,
  ): string => {
    const lines = splitLines(content)
    const headings = parseHeadings(lines)
    const head = [
      `===== ${file.path} =====`,
      fileText.folderBodyOmitted(budget),
      fileText.folderFileSize(
        file.stat?.size ?? content.length,
        lines.length,
        estimateTokens(content),
      ),
      fileText.folderReadGuidance(),
    ]

    if (headings.length === 0) {
      return [
        ...head,
        '',
        '## Structure',
        fileText.noHeadings(),
        `next=read_note_lines path="${file.path}" start_line=1 end_line=${Math.min(
          lines.length,
          MAX_RANGE_LINES,
        )}`,
      ].join('\n')
    }

    const outline = headings
      .slice(0, MAX_OVERSIZED_FOLDER_OUTLINE_HEADINGS)
      .map((heading, index) => {
        const end = sectionEndLine(headings, index, lines.length, true)
        const body = lines.slice(heading.line - 1, end).join('\n')
        const indent = '  '.repeat(Math.max(0, heading.level - 1))
        return `${indent}- L${heading.line} ${'#'.repeat(heading.level)} ${
          heading.heading
        } — lines ${heading.line}-${end} (~${estimateTokens(
          body,
        )} tok) next=read_note_section`
      })
    const more =
      headings.length > MAX_OVERSIZED_FOLDER_OUTLINE_HEADINGS
        ? `\n...(${headings.length - MAX_OVERSIZED_FOLDER_OUTLINE_HEADINGS} more headings; use note_outline for the full structure)`
        : ''
    return [...head, '', '## Structure', outline.join('\n') + more].join('\n')
  }

  switch (tool) {
    case 'active_note': {
      const activeFile = ctx.app.workspace?.getActiveFile?.() ?? null
      if (!activeFile)
        return {
          kind: 'read',
          text: JSON.stringify({ active: false, reason: 'no_active_file' }),
        }
      if (activeFile.extension !== 'md')
        return {
          kind: 'read',
          text: JSON.stringify({
            active: false,
            reason: 'active_file_not_markdown',
            path: activeFile.path,
          }),
        }

      assertNotAiPrivate(activeFile.path)
      const content = await ctx.app.vault.cachedRead(activeFile)
      const lines = splitLines(content)
      const headings = parseHeadings(lines)
      const cache = ctx.app.metadataCache?.getFileCache?.(activeFile)
      const frontmatterMatch = FRONTMATTER_RE.exec(content)
      let frontmatter: Record<string, unknown> = {}
      let frontmatterError: string | null = null
      if (
        cache?.frontmatter &&
        typeof cache.frontmatter === 'object' &&
        !Array.isArray(cache.frontmatter)
      ) {
        frontmatter = cache.frontmatter
      } else if (frontmatterMatch) {
        try {
          const parsed = parseYaml(frontmatterMatch[1]) as unknown
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            frontmatter = parsed as Record<string, unknown>
          else frontmatterError = 'Frontmatter must contain a YAML mapping.'
        } catch (error) {
          frontmatterError = `Malformed frontmatter YAML: ${error instanceof Error ? error.message : String(error)}`
        }
      }
      const boundedFrontmatter = boundFrontmatter(frontmatter)
      const outline = headings
        .slice(0, MAX_ACTIVE_OUTLINE_HEADINGS)
        .map((heading, index) => ({
          level: heading.level,
          heading:
            heading.heading.length > MAX_ACTIVE_HEADING_CHARS
              ? `${heading.heading.slice(0, MAX_ACTIVE_HEADING_CHARS - 1)}…`
              : heading.heading,
          line: heading.line,
          end_line: sectionEndLine(headings, index, lines.length, true),
        }))
      const result: Record<string, unknown> = {
        active: true,
        path: activeFile.path,
        basename: activeFile.basename,
        folder: activeFile.path.includes('/')
          ? activeFile.path.slice(0, activeFile.path.lastIndexOf('/'))
          : '',
        frontmatter: boundedFrontmatter.value,
        frontmatter_truncated: boundedFrontmatter.truncated,
        ...(frontmatterError ? { frontmatter_error: frontmatterError } : {}),
        outline_first_page: outline,
        outline_truncated: headings.length > MAX_ACTIVE_OUTLINE_HEADINGS,
        outline_text_truncated: headings
          .slice(0, MAX_ACTIVE_OUTLINE_HEADINGS)
          .some((heading) => heading.heading.length > MAX_ACTIVE_HEADING_CHARS),
      }
      if (args.include_content === true) {
        const boundedContent = boundActiveContent(
          content,
          Math.max(1_000, ctx.getContextBudget()),
        )
        result.content = boundedContent.text
        result.content_truncated = boundedContent.truncated
      }
      return { kind: 'read', text: JSON.stringify(result) }
    }

    case 'update_frontmatter': {
      const requestedPath = str(args, 'path')
      if (!requestedPath)
        return { kind: 'error', message: 'update_frontmatter requires "path".' }
      const target = await readMutationTarget(tool, requestedPath, ctx, ['md'])
      if ('kind' in target) return target
      const { path, before } = target
      if (before === null)
        return { kind: 'error', message: `File not found: ${requestedPath}` }
      const setArg = args.set
      if (
        setArg !== undefined &&
        (setArg === null || typeof setArg !== 'object' || Array.isArray(setArg))
      )
        return {
          kind: 'error',
          message: 'update_frontmatter "set" must be an object.',
        }
      const setEntries = Object.entries(
        (setArg ?? {}) as Record<string, unknown>,
      )
      const removeArg = args.remove
      if (
        removeArg !== undefined &&
        (!Array.isArray(removeArg) ||
          removeArg.some((key) => typeof key !== 'string'))
      )
        return {
          kind: 'error',
          message: 'update_frontmatter "remove" must be an array of strings.',
        }
      const removeKeys = (removeArg ?? []) as string[]
      if (setEntries.length === 0 && removeKeys.length === 0)
        return {
          kind: 'error',
          message: 'update_frontmatter requires a non-empty set or remove.',
        }
      const keysAreValid = (key: string): boolean =>
        key.trim().length > 0 && !/[\r\n]/.test(key)
      if (
        [...setEntries.map(([key]) => key), ...removeKeys].some(
          (key) => !keysAreValid(key),
        )
      )
        return {
          kind: 'error',
          message: 'Frontmatter keys must be non-empty and single-line.',
        }
      const setKeys = new Set(setEntries.map(([key]) => key))
      if (removeKeys.some((key) => setKeys.has(key)))
        return {
          kind: 'error',
          message:
            'The same frontmatter key cannot appear in both set and remove.',
        }
      const valueIsSupported = (value: unknown): boolean =>
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (Array.isArray(value) &&
          value.every((item) => typeof item === 'string'))
      if (setEntries.some(([, value]) => !valueIsSupported(value)))
        return {
          kind: 'error',
          message:
            'Frontmatter set values must be string, finite number, boolean, or string[].',
        }

      const frontmatterMatch = FRONTMATTER_RE.exec(before)
      let existing: Record<string, unknown> = {}
      if (frontmatterMatch) {
        try {
          const parsed = parseYaml(frontmatterMatch[1]) as unknown
          if (
            parsed !== null &&
            (typeof parsed !== 'object' || Array.isArray(parsed))
          )
            return {
              kind: 'error',
              message: 'Frontmatter must contain a YAML mapping.',
            }
          existing = (parsed as Record<string, unknown> | null) ?? {}
        } catch (error) {
          return {
            kind: 'error',
            message: `Malformed frontmatter YAML: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      }
      const updated = { ...existing }
      setEntries.forEach(([key, value]) => {
        updated[key] = value
      })
      const serializedSource = Object.fromEntries(
        Object.entries(updated).filter(([key]) => !removeKeys.includes(key)),
      )

      let serializedYaml: string
      try {
        serializedYaml = stringifyYaml(serializedSource)
      } catch (error) {
        return {
          kind: 'error',
          message: `Frontmatter serialization failed: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
      const newline = before.includes('\r\n') ? '\r\n' : '\n'
      const yamlBody = serializedYaml.trimEnd().replace(/\r?\n/g, newline)
      const block = ['---', yamlBody, '---']
        .filter((line, index) => index !== 1 || line.length > 0)
        .join(newline)
      const body = frontmatterMatch
        ? before.slice(frontmatterMatch[0].length)
        : before
      const hasFinalNewline = /\r?\n$/.test(before)
      const separator = body.length > 0 || hasFinalNewline ? newline : ''
      const after = `${block}${separator}${body}`
      if (after === before)
        return {
          kind: 'error',
          message: 'update_frontmatter would not change the file.',
        }
      return changeHelper('update_frontmatter', {
        op: 'modify',
        kind: 'frontmatter',
        path,
        before,
        after,
      })
    }

    case 'patch_section': {
      const requestedPath = str(args, 'path')
      const headingArg = str(args, 'heading')
      const mode = str(args, 'mode')
      const newContent = typeof args.content === 'string' ? args.content : null
      if (!requestedPath || !headingArg || !mode || newContent === null)
        return {
          kind: 'error',
          message:
            'patch_section requires "path", "heading", "mode", and "content".',
        }
      if (!['append', 'prepend', 'replace_body'].includes(mode))
        return {
          kind: 'error',
          message:
            'patch_section mode must be append, prepend, or replace_body.',
        }
      const target = await readMutationTarget(tool, requestedPath, ctx, ['md'])
      if ('kind' in target) return target
      const { path, before } = target
      if (before === null)
        return { kind: 'error', message: `File not found: ${requestedPath}` }
      const lines = splitLines(before)
      const headings = parseHeadings(lines)
      const matches = matchHeadingOccurrences(headings, headingArg)
      if (matches.length === 0) {
        const available = availableHeadingNames(headings).join(', ')
        return {
          kind: 'error',
          message: `Section not found: "${headingArg}". Available headings: ${available || 'none'}`,
        }
      }
      const occurrenceArg = args.occurrence
      const occurrence =
        occurrenceArg === undefined
          ? 1
          : Number.isInteger(Number(occurrenceArg)) && Number(occurrenceArg) > 0
            ? Number(occurrenceArg)
            : null
      if (occurrence === null)
        return {
          kind: 'error',
          message: 'patch_section occurrence must be a positive integer.',
        }
      if (matches.length > 1 && occurrenceArg === undefined)
        return {
          kind: 'error',
          message: `Heading "${headingArg}" is ambiguous; occurrence is required. Matches: ${matches
            .map(({ heading }, index) => `${index + 1}@line ${heading.line}`)
            .join(', ')}`,
        }
      const selected = selectHeadingOccurrence(matches, occurrence)
      if (!selected)
        return {
          kind: 'error',
          message: `occurrence ${occurrence} requested but "${headingArg}" appears only ${matches.length} time(s).`,
        }
      const endLine = sectionEndLine(
        headings,
        selected.index,
        lines.length,
        true,
      )
      const inserted = newContent.replace(/\r\n/g, '\n').split('\n')
      while (inserted.length > 0 && inserted[inserted.length - 1] === '')
        inserted.pop()
      const resultLines = [...lines]
      const bodyStart = selected.heading.line
      const bodyEnd = endLine
      const hadFinalNewline = /\r?\n$/.test(before)
      if (mode === 'append') {
        let insertionIndex = bodyEnd
        if (
          hadFinalNewline &&
          bodyEnd === resultLines.length &&
          resultLines[bodyEnd - 1] === ''
        )
          insertionIndex -= 1
        resultLines.splice(insertionIndex, 0, ...inserted)
      } else if (mode === 'prepend') {
        resultLines.splice(bodyStart, 0, ...inserted)
      } else {
        resultLines.splice(bodyStart, bodyEnd - bodyStart, ...inserted)
      }
      const newline = before.includes('\r\n') ? '\r\n' : '\n'
      let after = resultLines.join(newline)
      if (hadFinalNewline && !after.endsWith(newline)) after += newline
      if (after === before)
        return {
          kind: 'error',
          message: 'patch_section would not change the file.',
        }
      return changeHelper('patch_section', {
        op: 'modify',
        kind: 'body',
        path,
        before,
        after,
      })
    }

    case 'copy_file':
    case 'combine_files':
      return executeFileCompositionTool(tool, args, ctx)

    case 'read_file': {
      const path = str(args, 'path')
      if (!path) return { kind: 'error', message: 'read_file requires "path".' }
      const document =
        isDocumentPath(path) &&
        ctx.app.vault.getFileByPath?.(normalizePath(path))
          ? await new SourceTextReader(ctx.app).inspectDocument(
              normalizePath(path),
            )
          : null
      if (document && document.state !== 'ready')
        return {
          kind: 'read',
          facts: { completeness: 'unsupported' },
          evidencePaths: [],
          text: await unreadDocumentText(path, document.state, ctx),
        }
      const content =
        document?.state === 'ready'
          ? document.projection.projection
          : await readContent(path)
      if (content === null) {
        const unsupported = await unsupportedTextRead(path, ctx)
        return {
          kind: 'error',
          message: unsupported ?? fileText.missingReadFile(path),
        }
      }
      const contextBudget = Math.max(1_000, ctx.getContextBudget())
      const safetyThreshold = Math.max(
        1_000,
        Math.floor(contextBudget * READ_FILE_SAFETY_RATIO),
      )
      const contentTokens = estimateTokens(content)
      if (contentTokens > safetyThreshold) {
        const lines = splitLines(content)
        const headings = document ? [] : parseHeadings(lines)
        const outline =
          headings.length > 0
            ? headings
                .slice(0, MAX_READ_FILE_OUTLINE_HEADINGS)
                .map((heading) => {
                  const indent = '  '.repeat(Math.max(0, heading.level - 1))
                  return `${indent}- L${heading.line} ${'#'.repeat(heading.level)} ${heading.heading}`
                })
                .join('\n')
            : '(no headings)'
        const previewTokenBudget = Math.max(
          256,
          Math.min(2_000, Math.floor(contextBudget * 0.1)),
        )
        const previewCharBudget = Math.max(
          200,
          Math.floor(previewTokenBudget / 2.5),
        )
        const preview = content.slice(0, previewCharBudget)
        const previewLines = splitLines(preview).length
        return {
          kind: 'read',
          ...(document
            ? {
                facts: {
                  completeness: 'partial' as const,
                  sourceTruncated:
                    document.state === 'ready' && document.projection.truncated,
                },
                evidencePaths: [],
              }
            : {}),
          text: [
            ...(document?.state === 'ready'
              ? [
                  `## File: ${path} (disk_projection, version=${document.version})`,
                  ...(document.projection.truncated
                    ? [fileText.partialProjection()]
                    : []),
                ]
              : []),
            `[Large-file safeguard] ${path} is ~${contentTokens} tokens (${lines.length} lines), which is too large for one read_file result under the current model budget.`,
            'The full body was not inserted. Use note_outline, read_note_section, or read_note_lines to inspect only the ranges needed for this task.',
            '',
            '## Outline',
            outline,
            headings.length > MAX_READ_FILE_OUTLINE_HEADINGS
              ? `… ${headings.length - MAX_READ_FILE_OUTLINE_HEADINGS} more headings omitted`
              : '',
            '',
            `## Beginning (bounded preview, approximately lines 1-${previewLines})`,
            preview,
            '',
            `[Continue with read_note_lines path="${path}" start_line=${previewLines} end_line=${previewLines + MAX_RANGE_LINES - 1}, or select a heading with read_note_section.]`,
            renderOfferHint(path, content),
          ]
            .filter(Boolean)
            .join('\n'),
        }
      }
      if (document?.state === 'ready')
        return {
          kind: 'read',
          facts: {
            completeness: document.projection.truncated
              ? 'partial'
              : 'complete',
            sourceTruncated: document.projection.truncated,
          },
          evidencePaths: document.projection.truncated ? [] : [path],
          text: [
            `## File: ${path} (disk_projection, version=${document.version})`,
            ...(document.projection.truncated
              ? [fileText.partialProjection()]
              : []),
            content,
          ].join('\n\n'),
        }
      return { kind: 'read', text: content + renderOfferHint(path, content) }
    }

    case 'read_files':
      return readFiles(args, ctx)

    case 'render_base':
      return executeRenderBaseTool(args, ctx)

    case 'list_files':
      return executeFileListing(tool, args, ctx)

    case 'read_folder': {
      const folderQuery = str(args, 'folder')
      if (!folderQuery)
        return { kind: 'error', message: 'read_folder requires "folder".' }
      const extension = str(args, 'extension')
      const maxTokensArg =
        typeof args.max_tokens === 'number' && args.max_tokens > 0
          ? args.max_tokens
          : null
      const budget = maxTokensArg ?? ctx.getContextBudget()

      const exact = listedFiles(ctx, folderQuery)
      const matches = exact.length
        ? [
            {
              path: normalizePath(folderQuery).replace(/\/$/, ''),
              score: 1000,
              fileCount: exact.length,
            },
          ]
        : resolveFolders(ctx.app, folderQuery, 5, listedFiles(ctx))
      if (matches.length === 0) {
        return {
          kind: 'read',
          text: fileText.missingFolder(folderQuery),
        }
      }

      const best = matches[0]
      const ambiguous =
        matches.length > 1 && matches[1].score >= best.score * 0.85
      const alternatives = ambiguous
        ? matches
            .slice(1)
            .map((m) => fileText.folderCandidate(m.path, m.fileCount))
            .join(', ')
        : null

      const files = listedFiles(ctx, best.path, extension).sort(
        (a, b) =>
          a.path.split('/').length - b.path.split('/').length ||
          a.path.localeCompare(b.path),
      )

      if (files.length === 0) {
        return {
          kind: 'read',
          text: fileText.emptyFolder(
            best.path,
            extension ? `.${extension} ` : '',
          ),
        }
      }

      const offset = pageNumber(args.offset, 0)
      const limit = Math.max(1, pageNumber(args.limit, 200, 500))
      const selectedFiles = files.slice(offset, offset + limit)
      const nextOffset =
        offset + selectedFiles.length < files.length
          ? offset + selectedFiles.length
          : undefined
      const sections: string[] = []
      const included: string[] = []
      const omitted: string[] = []
      const omittedMeta: string[] = []
      let usedTokens = 0
      for (const file of selectedFiles) {
        if (
          isAiPrivatePath(file.path) ||
          !READABLE_TEXT_EXTENSIONS.includes(file.extension.toLowerCase())
        ) {
          omitted.push(file.path)
          omittedMeta.push(
            `${file.path} (format=${file.extension}, next=${await sourceReadHint(file.path, ctx)})`,
          )
          continue
        }
        const content = await ctx.app.vault.cachedRead(file)
        const section = `===== ${file.path} =====\n${content}`
        const tokens = estimateTokens(section)
        if (included.length === 0 && tokens > budget) {
          sections.push(formatOversizedFolderFile(file, content, budget))
          included.push(`${file.path} (outline only)`)
          usedTokens = estimateTokens(sections[sections.length - 1])
          continue
        }
        if (usedTokens + tokens > budget) {
          omitted.push(file.path)
          const lines = splitLines(content).length
          const size =
            typeof file.stat?.size === 'number'
              ? file.stat.size
              : content.length
          omittedMeta.push(
            `${file.path} (size=${size}B, lines=${lines}, tokens~${estimateTokens(content)}, next=note_outline/read_note_lines)`,
          )
          continue
        }
        sections.push(section)
        included.push(file.path)
        usedTokens += tokens
      }

      const header = [
        fileText.folderResultHeader(
          best.path,
          folderQuery,
          files.length,
          included.length,
          usedTokens,
          budget,
        ),
        alternatives ? fileText.folderAlternatives(alternatives) : null,
        omitted.length > 0
          ? fileText.folderBudgetOmitted(
              omitted.length,
              omittedMeta.join('\n').slice(0, 12000),
            )
          : null,
      ]
        .filter(Boolean)
        .join('\n')

      return {
        kind: 'read',
        facts: {
          completeness:
            omitted.length || nextOffset !== undefined ? 'partial' : 'complete',
          total: files.length,
          returned: included.length,
          omittedPaths: omitted.slice(0, 50),
          ...(nextOffset !== undefined ? { nextOffset } : {}),
        },
        text: `${header}\n\n${sections.join('\n\n')}${nextOffset !== undefined ? `\nnextOffset=${nextOffset}` : ''}`,
      }
    }

    case 'read_frontmatter': {
      const path = str(args, 'path')
      if (!path)
        return { kind: 'error', message: 'read_frontmatter requires "path".' }
      const content = await readContent(path)
      if (content === null)
        return { kind: 'error', message: `File not found: ${path}` }
      const match = FRONTMATTER_RE.exec(content)
      const data = match ? ((parseYaml(match[1]) as unknown) ?? {}) : {}
      return { kind: 'read', text: JSON.stringify(data, null, 2) }
    }

    case 'find_by_property': {
      const result = queryProperty(args, ctx)
      if (result.kind !== 'read' || args.exhaustive === true) return result
      const bases = await relatedBaseViews(ctx.app, str(args, 'value') ?? '')
      return { ...result, text: result.text + bases }
    }

    case 'parse_links': {
      const path = str(args, 'path')
      if (!path)
        return { kind: 'error', message: 'parse_links requires "path".' }
      const file = fileForPath(path)
      const cached = file ? cachedLinkTargets(ctx.app, file) : null
      if (cached) {
        return {
          kind: 'read',
          text: cached.length > 0 ? cached.join('\n') : '(no links)',
        }
      }
      const content = await readContent(path)
      if (content === null)
        return { kind: 'error', message: `File not found: ${path}` }
      const links = extractLinks(content)
      return {
        kind: 'read',
        text: links.length > 0 ? links.join('\n') : '(no links)',
      }
    }

    case 'write_file': {
      const requestedPath = str(args, 'path')
      const content = typeof args.content === 'string' ? args.content : null
      if (!requestedPath || content === null)
        return {
          kind: 'error',
          message: 'write_file requires "path" and "content".',
        }
      const normalized = normalizeVaultPathKey(
        assertUserVaultPath(ctx.app, requestedPath),
      )
      const addedMdExtension = !hasBasenameExtension(normalized)
      const targetPath = addedMdExtension ? `${normalized}.md` : requestedPath
      const target = await readMutationTarget(tool, targetPath, ctx, [
        'md',
        'base',
        'canvas',
      ])
      if ('kind' in target) return target
      const { path, before } = target
      if (addedMdExtension && before !== null)
        return {
          kind: 'error',
          message: fileText.writeFileExistingMdConflict(path),
        }
      return changeHelper('write_file', {
        op: before === null ? 'create' : 'modify',
        kind: before === null ? 'create' : 'body',
        path,
        before,
        after: content,
        ...(addedMdExtension
          ? { resultSummary: fileText.writeFileAddedMdExtension() }
          : {}),
      })
    }

    case 'update_file': {
      const requestedPath = str(args, 'path')
      if (!requestedPath)
        return { kind: 'error', message: 'update_file requires "path".' }
      const target = await readMutationTarget(tool, requestedPath, ctx, [
        'md',
        'base',
      ])
      if ('kind' in target) return target
      const { path, before } = target
      if (before === null)
        return {
          kind: 'error',
          message: `update_file target does not exist: ${requestedPath}`,
        }
      const content = typeof args.content === 'string' ? args.content : null
      if (content === null)
        return { kind: 'error', message: 'update_file requires "content".' }
      const after =
        args.append === true
          ? appendFileContent(before, content, path)
          : content
      return changeHelper('update_file', {
        op: 'modify',
        kind: 'body',
        path,
        before,
        after,
      })
    }

    case 'replace_in_file': {
      const requestedPath = str(args, 'path')
      if (!requestedPath)
        return { kind: 'error', message: 'replace_in_file requires "path".' }
      const oldString =
        typeof args.old_string === 'string' ? args.old_string : null
      const newString =
        typeof args.new_string === 'string' ? args.new_string : null
      if (oldString === null || newString === null)
        return {
          kind: 'error',
          message: 'replace_in_file requires "old_string" and "new_string".',
        }
      if (oldString.length === 0)
        return {
          kind: 'error',
          message:
            'replace_in_file old_string must not be empty. Use write_file to create or fully replace content.',
        }
      if (oldString === newString)
        return {
          kind: 'error',
          message: 'replace_in_file old_string and new_string must differ.',
        }

      const target = await readMutationTarget(tool, requestedPath, ctx, [
        'md',
        'base',
      ])
      if ('kind' in target) return target
      const { path, before } = target
      if (before === null)
        return { kind: 'error', message: `File not found: ${requestedPath}` }

      const replaceAll = args.replace_all === true
      const countOccurrences = (haystack: string, needle: string): number => {
        if (needle.length === 0) return 0
        let count = 0
        let index = haystack.indexOf(needle)
        while (index !== -1) {
          count += 1
          index = haystack.indexOf(needle, index + needle.length)
        }
        return count
      }
      const replaceFirstLiteral = (
        haystack: string,
        needle: string,
        replacement: string,
      ): string => {
        const index = haystack.indexOf(needle)
        if (index === -1) return haystack
        return (
          haystack.slice(0, index) +
          replacement +
          haystack.slice(index + needle.length)
        )
      }

      let effectiveOld = oldString
      let effectiveNew = newString
      let occurrences = countOccurrences(before, effectiveOld)
      if (
        occurrences === 0 &&
        before.includes('\r\n') &&
        /(?<!\r)\n/.test(oldString)
      ) {
        effectiveOld = toCrlf(oldString)
        effectiveNew = toCrlf(newString)
        occurrences = countOccurrences(before, effectiveOld)
        if (effectiveOld === effectiveNew)
          return {
            kind: 'error',
            message: 'replace_in_file old_string and new_string must differ.',
          }
      }
      if (occurrences === 0)
        return {
          kind: 'error',
          message: `replace_in_file: old_string not found in ${path}. It must match the file exactly, including whitespace and indentation.`,
        }
      if (occurrences > 1 && !replaceAll)
        return {
          kind: 'error',
          message: `replace_in_file: old_string occurs ${occurrences} times in ${path}. Add surrounding context so it is unique, or pass replace_all=true to replace every occurrence.`,
        }

      const after = replaceAll
        ? before.split(effectiveOld).join(effectiveNew)
        : replaceFirstLiteral(before, effectiveOld, effectiveNew)
      return changeHelper('replace_in_file', {
        op: 'modify',
        kind: 'body',
        path,
        before,
        after,
      })
    }

    case 'rename_file':
    case 'move_file': {
      const isRename = tool === 'rename_file'
      const requestedPath = str(args, 'path')
      const newPath = str(args, 'new_path')
      if (!requestedPath || !newPath)
        return {
          kind: 'error',
          message: `${tool} requires "path" and "new_path".`,
        }
      const target = await readMutationTarget(tool, requestedPath, ctx, [
        'md',
        'base',
      ])
      if ('kind' in target) return target
      const { path, before } = target
      if (before === null) return missingMutationFile(tool, requestedPath, ctx)
      if (await ctx.app.vault.adapter.exists(normalizePath(newPath)))
        return {
          kind: 'error',
          message: `Destination already exists: ${newPath}`,
        }
      if (!ctx.conversationId)
        return changeHelper(tool, {
          op: isRename ? 'rename' : 'move',
          kind: isRename ? 'rename' : 'move',
          path: newPath,
          originalPath: path,
          before,
          after: before,
        })
      if (
        isRename &&
        folderOf(normalizePath(path)) !== folderOf(normalizePath(newPath))
      )
        return {
          kind: 'error',
          message: 'rename_file requires the same folder.',
        }
      const linkers = backlinkers(ctx.app, normalizePath(path))
      return changeHelper(tool, {
        op: isRename ? 'rename' : 'move',
        kind: isRename ? 'rename' : 'move',
        path: newPath,
        originalPath: path,
        before,
        after: before,
        approvalMode: 'whole_change',
        approvalNotes: [
          t(isRename ? 'fileToolR6.rename' : 'fileToolR6.move', {
            path,
            newPath,
          }),
          ...linkUpdateNotes(ctx.app, linkers),
        ],
        composite: {
          operation: 'note_rename',
          entries: [
            {
              op: 'rename',
              path: newPath,
              originalPath: path,
              before,
              after: before,
            },
            ...(await linkerEntries(ctx.app, linkers, [normalizePath(path)])),
          ],
          params: { path, newPath, aliasedContent: null },
        },
      })
    }

    case 'delete_file': {
      const requestedPath = str(args, 'path')
      if (!requestedPath)
        return { kind: 'error', message: 'delete_file requires "path".' }
      const target = await readMutationTarget(tool, requestedPath, ctx, [
        'md',
        'base',
      ])
      if ('kind' in target) return target
      const { path, before } = target
      if (before === null) return missingMutationFile(tool, requestedPath, ctx)
      if (!ctx.conversationId)
        return changeHelper('delete_file', {
          op: 'delete',
          kind: 'delete',
          path,
          originalPath: path,
          before,
          after: null,
        })
      return changeHelper('delete_file', {
        op: 'delete',
        kind: 'delete',
        path,
        originalPath: path,
        before,
        after: null,
        approvalMode: 'whole_change',
        approvalNotes: [t('fileToolR6.trash', { path })],
        composite: {
          operation: 'file_trash',
          entries: [{ op: 'delete', path, before, after: null }],
          params: { path },
        },
      })
    }

    default:
      return { kind: 'error', message: `Unknown file tool: ${tool}` }
  }
}
