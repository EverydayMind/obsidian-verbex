import { listedFiles } from '../tools/fileListing'
import type {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
} from '../tools/localToolCommon'

import { validateLinkAuditArgs } from './linkAuditArgs'
import * as modelText from './linkAuditText'

export function auditLinks(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): ToolResult {
  const error = validateLinkAuditArgs(args)
  if (error) return { kind: 'error', message: error }
  if (ctx.signal?.aborted)
    return { kind: 'error', message: modelText.aborted() }
  const folder = args.folder as string | undefined
  const files = listedFiles(ctx, folder, 'md')
  const resolved = ctx.app.metadataCache.resolvedLinks ?? {}
  const unresolved = ctx.app.metadataCache.unresolvedLinks ?? {}
  const unindexed = files.filter(
    (f) => !Object.prototype.hasOwnProperty.call(resolved, f.path),
  ).length
  const offset = (args.offset as number | undefined) ?? 0
  const limit = (args.limit as number | undefined) ?? 100
  let rows: string[]
  let header: string
  if (args.kind === 'orphans') {
    const incoming = new Set<string>()
    for (const [source, links] of Object.entries(resolved))
      for (const [target, count] of Object.entries(links))
        if (source !== target && count > 0) incoming.add(target)
    const orphans = files.filter((f) => !incoming.has(f.path))
    const noOutgoing = orphans.filter(
      (f) =>
        Object.values(resolved[f.path] ?? {}).every((n) => n <= 0) &&
        Object.values(unresolved[f.path] ?? {}).every((n) => n <= 0),
    ).length
    rows = orphans.map((f) => f.path)
    header = modelText.orphans(
      folder ?? modelText.all(),
      files.length,
      rows.length,
      noOutgoing,
      unindexed,
    )
  } else {
    const entries = files.flatMap((f) =>
      Object.entries(unresolved[f.path] ?? {})
        .filter(([, n]) => n > 0)
        .sort(([a], [b]) => a.localeCompare(b, 'ko'))
        .map(([target, n]) => ({ source: f.path, target, n })),
    )
    rows = entries.map((e) => modelText.row(e.source, e.target, e.n))
    header = modelText.unresolved(
      folder ?? modelText.all(),
      new Set(entries.map((e) => e.target)).size,
      entries.reduce((n, e) => n + e.n, 0),
      new Set(entries.map((e) => e.source)).size,
      unindexed,
    )
  }
  let text = header,
    returned = 0
  for (const row of rows.slice(offset, offset + limit)) {
    if (text.length + row.length + 1 > 11950) break
    text += `\n${row}`
    returned++
  }
  const next = offset + returned < rows.length ? offset + returned : undefined
  if (next !== undefined) text += modelText.nextPage(next)
  if (ctx.signal?.aborted)
    return { kind: 'error', message: modelText.aborted() }
  return {
    kind: 'read',
    text,
    facts: {
      total: rows.length,
      returned,
      ...(next !== undefined ? { nextOffset: next } : {}),
      completeness: unindexed || next !== undefined ? 'partial' : 'complete',
    },
  }
}
