import { App, TFile, normalizePath } from 'obsidian'

import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import { stringifyUnknown } from '../../utils/stringifyUnknown'
import { fileMinuteTie } from '../vault-facts/minuteTie'

import { alternateExtensionHint, nameMatches } from './fileListingAlternate'
import { fileRows } from './fileListingRows'
import { fileSortArgs, sortFiles } from './fileListingSort'
import * as modelText from './fileListingText'
import {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
  str,
} from './localToolCommon'
import { pageNumber } from './propertyQuery'

export function visibleVaultFiles(app: App): TFile[] {
  return app.vault.getFiles().filter((file) => {
    try {
      assertUserVaultPath(app, file.path)
      return !file.path.split('/').some((part) => part.startsWith('.'))
    } catch {
      return false
    }
  })
}

export function listedFiles(
  ctx: ToolExecutionContext,
  folder?: string | null,
  extension?: string | null,
): TFile[] {
  const root = folder ? normalizePath(folder).replace(/^\.\/?|\/$/g, '') : ''
  const ext = extension?.trim().replace(/^\.+/, '').toLowerCase()
  return visibleVaultFiles(ctx.app)
    .filter((file) => {
      return (
        (!root || file.path.startsWith(`${root}/`)) &&
        (!ext || file.extension.toLowerCase() === ext)
      )
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

export function executeFileListing(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
): ToolResult {
  const name = str(args, 'name')?.trim()
  if (
    (args.name !== undefined && typeof args.name !== 'string') ||
    (name &&
      args.name_match !== undefined &&
      !['exact', 'contains'].includes(stringifyUnknown(args.name_match))) ||
    (name && /[/\\]/.test(name))
  )
    return {
      kind: 'error',
      message:
        'list_files name must be a filename; name_match must be exact or contains when name is provided.',
    }
  let files = listedFiles(
    ctx,
    str(args, 'folder'),
    str(args, 'extension'),
  ).filter((file) => nameMatches(file, name, args))
  const alternateHint = alternateExtensionHint(
    tool,
    args,
    name,
    str(args, 'extension'),
    (extension) => listedFiles(ctx, str(args, 'folder'), extension),
  )
  if (tool === 'folder_tree' && typeof args.max_depth === 'number')
    files = files.filter(
      (file) => file.path.split('/').length - 1 <= Number(args.max_depth),
    )
  const sorting =
    tool === 'list_files'
      ? fileSortArgs(args)
      : { sort: 'path' as const, order: 'asc' as const }
  if (typeof sorting === 'string') return { kind: 'error', message: sorting }
  if (tool === 'list_files') sortFiles(files, sorting.sort, sorting.order)
  const offset = pageNumber(args.offset, 0)
  const limit = Math.max(1, pageNumber(args.limit, 200, 500))
  const page = files.slice(offset, offset + limit)
  const nextOffset =
    offset + page.length < files.length ? offset + page.length : undefined
  const priority = normalizePath(ctx.getPriorityFolder().trim()).replace(
    /\/$/,
    '',
  )
  const rows = (items: TFile[]) => fileRows(items, sorting.sort)
  const preferred = page.filter(
    (file) =>
      sorting.sort === 'path' &&
      priority &&
      file.path.startsWith(`${priority}/`),
  )
  let text = preferred.length
    ? modelText.priority(
        priority,
        rows(preferred),
        rows(page.filter((file) => !preferred.includes(file))),
      )
    : rows(page)
  if (tool === 'folder_tree') {
    const counts = new Map<string, number>()
    const pageFolders = new Set<string>()
    for (const file of files) {
      const parts = file.path.split('/').slice(0, -1)
      for (let depth = 1; depth <= parts.length; depth++) {
        const dir = parts.slice(0, depth).join('/')
        counts.set(dir, (counts.get(dir) ?? 0) + 1)
        if (page.includes(file)) pageFolders.add(dir)
      }
    }
    text =
      [...counts]
        .filter(([dir]) => pageFolders.has(dir))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([dir, count]) =>
            `${'  '.repeat(dir.split('/').length - 1)}- ${dir.split('/').pop() ?? dir} (${count})`,
        )
        .join('\n') +
      '\n' +
      text
  }
  return {
    kind: 'read',
    facts: {
      completeness:
        nextOffset !== undefined
          ? 'partial'
          : files.length
            ? 'complete'
            : 'empty',
      total: files.length,
      returned: page.length,
      ...(nextOffset !== undefined
        ? { nextOffset, errorCode: 'limit' as const }
        : {}),
    },
    text:
      (text || '(no files)') +
      (nextOffset !== undefined
        ? `\n... omitted=${files.length - offset - page.length}, nextOffset=${nextOffset}`
        : '') +
      alternateHint +
      (tool === 'list_files'
        ? fileMinuteTie(ctx.app, files, sorting.sort)
        : ''),
  }
}
