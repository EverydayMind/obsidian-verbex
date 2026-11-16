import { estimateTokens } from '../../utils/llm/estimateTokens'
import { truncateTextToTokens } from '../batch/contextPacker'
import { isDocumentPath } from '../rag/documentSources/indexableSources'
import { SourceTextReader } from '../rag/sourceTextReader'

import * as documentReadText from './documentReadText'
import {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
  readToolText,
} from './localToolCommon'
import { describeMissingPaths } from './pathSuggestion'
import { sourceReadHint, unsupportedTextRead } from './sourceReadHint'

export async function readFiles(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const readContent = async (path: string): Promise<string | null> => {
    return readToolText(path, ctx)
  }
  const requested = Array.isArray(args.paths)
    ? (args.paths as unknown[])
        .filter((path): path is string => typeof path === 'string')
        .map((path) => path.trim())
        .filter(Boolean)
    : []
  if (requested.length === 0) {
    return { kind: 'error', message: 'read_files requires "paths".' }
  }
  const uniquePaths = [...new Set(requested)]
  const paths = uniquePaths.slice(0, 20)
  const defaultBudget = Math.min(
    Math.max(Math.floor(ctx.getContextBudget() * 0.6), 4_000),
    48_000,
  )
  const safeUpperBound = Math.max(
    1_000,
    Math.floor(ctx.getContextBudget() * 0.6),
  )
  const maxTokens = Math.min(
    Math.max(
      typeof args.max_tokens === 'number'
        ? Math.floor(args.max_tokens)
        : defaultBudget,
      1_000,
    ),
    64_000,
    safeUpperBound,
  )
  const sections: string[] = []
  const missing: string[] = []
  const omitted: string[] = []
  const truncated: string[] = []
  const sourceTruncated: string[] = []
  const unreadable: string[] = []
  const unreadableDetails: string[] = []
  let usedTokens = 0
  for (const path of paths) {
    const document =
      isDocumentPath(path) && ctx.app.vault.getFileByPath?.(path)
        ? await new SourceTextReader(ctx.app).inspectDocument(path)
        : null
    if (document && document.state !== 'ready') {
      unreadable.push(path)
      unreadableDetails.push(
        `${path} (state=${document.state}, next=${await sourceReadHint(path, ctx)})`,
      )
      continue
    }
    const content =
      document?.state === 'ready'
        ? document.projection.projection
        : await readContent(path)
    if (content === null) {
      const unsupported = await unsupportedTextRead(path, ctx)
      if (unsupported) {
        unreadable.push(path)
        unreadableDetails.push(unsupported)
      } else missing.push(path)
      continue
    }
    const header = `<!-- verbex-read-file:${path} -->\n## File: ${path}${document?.state === 'ready' ? ` (disk_projection, version=${document.version})` : ''}\n\n${document?.state === 'ready' && document.projection.truncated ? documentReadText.partialProjection() : ''}`
    const remaining = maxTokens - usedTokens
    if (remaining < 200) {
      omitted.push(path)
      continue
    }
    const notice = documentReadText.batchTruncation()
    let section = header + content
    if (estimateTokens(section) > remaining) {
      if (estimateTokens(header + notice) > remaining) {
        omitted.push(path)
        continue
      }
      let budget = remaining - estimateTokens(header + notice)
      section = header + truncateTextToTokens(content, budget) + notice
      while (estimateTokens(section) > remaining && budget > 0) {
        budget--
        section = header + truncateTextToTokens(content, budget) + notice
      }
      truncated.push(path)
    }
    if (document?.state === 'ready' && document.projection.truncated)
      sourceTruncated.push(path)
    sections.push(section)
    usedTokens += estimateTokens(section)
  }
  const recovery: string[] = []
  if (unreadable.length)
    recovery.push(documentReadText.unreadable(unreadableDetails.join(', ')))
  if (missing.length > 0) {
    recovery.push(
      documentReadText.missing(
        describeMissingPaths(
          ctx.app.vault.getFiles(),
          missing,
          paths.filter(
            (p) => ![...missing, ...omitted, ...unreadable].includes(p),
          ),
        ),
      ),
    )
  }
  if (omitted.length > 0) {
    recovery.push(documentReadText.budgetOmitted(omitted.join(', ')))
  }
  return {
    kind: 'read',
    evidencePaths: paths.filter(
      (p) =>
        !missing.includes(p) &&
        !omitted.includes(p) &&
        !truncated.includes(p) &&
        !unreadable.includes(p) &&
        !sourceTruncated.includes(p),
    ),
    facts: {
      completeness:
        missing.length ||
        omitted.length ||
        truncated.length ||
        unreadable.length ||
        sourceTruncated.length ||
        uniquePaths.length > paths.length
          ? 'partial'
          : 'complete',
      total: requested.length,
      returned: sections.length,
      ...(sourceTruncated.length ? { sourceTruncated: true } : {}),
      omittedPaths: [
        ...missing,
        ...omitted,
        ...truncated,
        ...unreadable,
        ...sourceTruncated,
        ...uniquePaths.slice(paths.length),
      ].slice(0, 50),
      ...(missing.length
        ? { errorCode: 'not_found' as const }
        : omitted.length ||
            truncated.length ||
            uniquePaths.length > paths.length
          ? { errorCode: 'budget' as const }
          : {}),
    },
    text: [
      documentReadText.batchSummary(
        requested.length,
        sections.length,
        usedTokens,
        maxTokens,
      ),
      ...recovery,
      ...sections,
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
