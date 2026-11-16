import { DEFAULT_EXPORT_FOLDER as EXPORT_FOLDER } from '../../constants'
import { assertUserVaultPath } from '../../security/vaultPathPolicy'

import {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
  changeHelper,
  str,
} from './localToolCommon'
import { show } from './propertyMatch'
import { accessPolicyFingerprint, stale } from './propertyQueryCursor'
import * as propertyQueryExportText from './propertyQueryExportText'

export { DEFAULT_EXPORT_FOLDER as EXPORT_FOLDER } from '../../constants'

const text = (value: unknown): string =>
  value === undefined || value === null
    ? ''
    : typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? value.map(text).join(', ')
        : show(value)

const cell = (value: unknown): string =>
  text(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

const slug = (text: string): string =>
  text
    .replace(/[\\/:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)

const stamp = (now: Date): string =>
  `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`

/**
 * Writes every row of an exhaustive snapshot to a new note (RW-06 contract
 * §8). The host renders the table, so the model never retypes a long list;
 * the note goes through the usual permission → approval → checkpoint → apply.
 */
export function exportPropertyQuery(
  args: ToolArgs,
  ctx: ToolExecutionContext,
  now = new Date(),
): ToolResult {
  const cursor = str(args, 'cursor')
  const store = ctx.propertyQuerySessions
  if (!cursor || !store)
    return {
      kind: 'error',
      message:
        'export_property_query requires "cursor" from a find_by_property exhaustive=true result.',
    }
  const found = store.lookup(
    cursor,
    ctx.conversationId ?? '',
    null,
    accessPolicyFingerprint(ctx),
  )
  if (!found.ok) return stale(cursor, found.state, found.condition)
  const { session } = found
  const requested = str(args, 'path')
  const path =
    requested ??
    `${EXPORT_FOLDER}/${slug(session.condition) || 'property'} ${stamp(now)}.md`
  try {
    assertUserVaultPath(ctx.app, path)
  } catch (error) {
    return { kind: 'error', message: (error as Error).message }
  }
  if (!path.toLowerCase().endsWith('.md'))
    return {
      kind: 'error',
      message: 'export_property_query: path must end with .md.',
    }
  if (
    ctx.app.vault.getAbstractFileByPath?.(path) ??
    ctx.app.vault.getFileByPath?.(path)
  )
    return {
      kind: 'error',
      message: `export_property_query: ${path} already exists. Pass a new path; existing notes are never overwritten.`,
    }
  // The queried property is already the first column.
  const fields = session.fields.filter(
    (f) => f.toLowerCase() !== session.prop.toLowerCase(),
  )
  const columns = [session.prop, ...fields]
  const rows = session.rows.map(
    (row, i) =>
      `| ${i + 1} | [[${row.path.replace(/\.md$/i, '')}]] | ${[row.actual, ...fields.map((f) => row.projected[f])].map(cell).join(' | ')} |`,
  )
  const content = [
    propertyQueryExportText.title(session.condition),
    '',
    propertyQueryExportText.matchCount(session.rows.length, session.cursor),
    propertyQueryExportText.exportStamp(stamp(now)),
    '',
    propertyQueryExportText.tableHeader(columns.map(cell).join(' | ')),
    `| --- | --- | ${columns.map(() => '---').join(' | ')} |`,
    ...rows,
    '',
  ].join('\n')
  return changeHelper('export_property_query', {
    op: 'create',
    kind: 'create',
    path,
    before: null,
    after: content,
  })
}
