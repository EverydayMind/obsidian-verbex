import { normalizePath } from 'obsidian'

import { createHash, nodeBuffer } from '../../platform/node/api'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { tokenCount } from '../../utils/llm/token'
import { stringifyUnknown } from '../../utils/stringifyUnknown'
import {
  locator,
  tableHeaders,
} from '../rag/documentSources/documentReadMetadata'
import { isDocumentPath } from '../rag/documentSources/indexableSources'
import { extractorKey } from '../rag/documentSources/projection'
import { SourceTextReader } from '../rag/sourceTextReader'

import { documentReadEntries, readNumber } from './documentReadSelection'
import {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
  str,
} from './localToolCommon'
import { sourceReadHint } from './sourceReadHint'
import { pendingApprovalSuffix } from './unreadDocumentText'

const READERS = [
  'note_outline',
  'search_in_file',
  'read_note_lines',
  'read_note_section',
  'read_note_around',
]
type Cursor = { key: string; index: number; column: number }
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
/** Separate read-only branch: mutation resolvers remain Markdown/base only. */
export async function executeDocumentRead(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult | null> {
  const path = str(args, 'path')
  if (!path || !isDocumentPath(path) || !READERS.includes(tool)) return null
  if (ctx.signal?.aborted)
    return {
      kind: 'error',
      message: 'Document read aborted.',
      retryAllowed: false,
    }
  const status = await new SourceTextReader(ctx.app).inspectDocument(
    normalizePath(path),
  )
  if (status.state !== 'ready')
    return {
      kind: 'read',
      facts: { completeness: 'unsupported' },
      text:
        JSON.stringify({
          path,
          state: status.state,
          next: await sourceReadHint(path, ctx),
        }) + pendingApprovalSuffix(ctx, [status.state]),
    }
  const p = status.projection
  const lines = p.projection.split(/\r?\n/)
  const key = hash({
    path: p.path,
    revision: p.sourceSha256,
    projection: hash(p.projection),
    extractor: extractorKey(p),
    tool,
    args: { ...args, continuation: undefined },
  })
  let cursor: Cursor = { key, index: 0, column: 0 }
  if (args.continuation !== undefined) {
    try {
      cursor = JSON.parse(
        nodeBuffer()
          .from(stringifyUnknown(args.continuation), 'base64url')
          .toString('utf8'),
      ) as Cursor
      if (
        cursor.key !== key ||
        !Number.isSafeInteger(cursor.index) ||
        cursor.index < 0 ||
        !Number.isSafeInteger(cursor.column) ||
        cursor.column < 0
      )
        throw new Error('stale')
    } catch {
      return {
        kind: 'read',
        facts: { completeness: 'unsupported', errorCode: 'invalidated' },
        text: 'stale continuation: source/revision/range/query changed; request a fresh outline.',
      }
    }
  }
  try {
    const entries = documentReadEntries(p, lines, tool, args)
    if (
      cursor.index > entries.length ||
      (cursor.index === entries.length && cursor.column !== 0)
    )
      throw new Error('Invalid continuation position')
    const limit =
      tool === 'note_outline'
        ? readNumber(args, 'limit', 80, 1, 200)
        : tool === 'search_in_file'
          ? readNumber(args, 'max_matches', 50, 1, 200)
          : 400
    const budget = Math.max(
      0,
      Math.min(4000, Math.floor(ctx.getContextBudget() * 0.25)),
    )
    const result = {
      path: p.path,
      sourceSha256: p.sourceSha256,
      projectionSchema: p.schemaVersion,
      version: status.version,
      pageMode: p.pageMode,
      sourceTruncated: p.truncated,
      coverage: 'partial' as const,
      entries: [] as {
        startLine: number
        endLine: number
        startColumn: number
        endColumn: number
        text: string
        locators: ReturnType<typeof locator>
        tableHeaders: ReturnType<typeof tableHeaders>
      }[],
      truncated: false,
      continuation: undefined as string | undefined,
    }
    let i = cursor.index,
      column = cursor.column
    const serialize = () => JSON.stringify(result)
    for (; i < entries.length && result.entries.length < limit; i++) {
      if (ctx.signal?.aborted)
        return {
          kind: 'error',
          message: 'Document read aborted.',
          retryAllowed: false,
        }
      const entry = entries[i]
      const full =
        entry.text || lines.slice(entry.start - 1, entry.end).join('\n')
      if (column > full.length) throw new Error('Invalid continuation column')
      const text = full.slice(column)
      const item = {
        startLine: entry.start,
        endLine: entry.end,
        startColumn: column,
        endColumn: full.length,
        text,
        locators: locator(p, entry.start, entry.end),
        tableHeaders: tableHeaders(p, entry.start, entry.end),
      }
      result.entries.push(item)
      // Reserve space for cursor and truncation metadata, then check final serialization.
      if (
        serialize().length > 22_000 ||
        estimateTokens(serialize()) > Math.max(0, budget - 350)
      ) {
        result.entries.pop()
        if (result.entries.length) break
        result.entries.push(item)
        let low = 0,
          high = text.length
        while (low < high) {
          const mid = Math.ceil((low + high) / 2)
          item.text = text.slice(0, mid)
          item.endColumn = column + mid
          if (
            serialize().length <= 22_000 &&
            estimateTokens(serialize()) <= Math.max(0, budget - 350)
          )
            low = mid
          else high = mid - 1
        }
        if (!low)
          return {
            kind: 'read',
            facts: { completeness: 'partial', errorCode: 'budget' },
            text: 'Document metadata exceeds read budget; increase context budget.',
          }
        item.text = text.slice(0, low)
        item.endColumn = column + low
        column += low
        if (column === full.length) {
          i++
          column = 0
        }
        break
      }
      column = 0
    }
    result.truncated = i < entries.length
    if (result.truncated)
      result.continuation = nodeBuffer()
        .from(JSON.stringify({ key, index: i, column }))
        .toString('base64url')
    const text = serialize()
    if (
      estimateTokens(text) > budget ||
      (await tokenCount(text)) > budget ||
      text.length > 24_000
    )
      return {
        kind: 'error',
        message: 'Document result exceeds context budget',
        retryAllowed: false,
      }
    return {
      kind: 'read',
      facts: {
        completeness:
          result.truncated || p.truncated
            ? 'partial'
            : entries.length
              ? 'complete'
              : 'empty',
        total: entries.length,
        returned: result.entries.length,
      },
      text,
    }
  } catch (error) {
    return {
      kind: 'error',
      message: (error as Error).message,
      retryAllowed: false,
    }
  }
}
