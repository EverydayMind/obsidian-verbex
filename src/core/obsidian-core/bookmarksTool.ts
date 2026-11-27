import { type App, normalizePath } from 'obsidian'

import { L } from '../../i18n/modelText'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import { enabledCorePlugin } from '../obsidian-core/internalPlugins'
import type { ToolExecutionContext, ToolResult } from '../tools/localToolCommon'

import { corePluginDisabledError } from './corePluginMeta'

export type BookmarkItem = {
  type?: string
  title?: string
  path?: string
  subpath?: string
  query?: string
  url?: string
  items?: BookmarkItem[]
}

type BookmarksPlugin = {
  items?: BookmarkItem[]
  getBookmarks?: () => BookmarkItem[]
}

function basenameOf(path: string): string {
  const leaf = normalizePath(path).split('/').pop() ?? path
  return leaf.replace(/\.md$/i, '')
}

function existsInVault(app: App, normalizedPath: string): boolean {
  if (app.vault.getAbstractFileByPath) {
    return app.vault.getAbstractFileByPath(normalizedPath) !== null
  }
  const byPath = app.vault.getFileByPath?.(normalizedPath)
  return Boolean(byPath && normalizePath(byPath.path) === normalizedPath)
}

function nonEmpty(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function formatBookmarkItems(
  app: App,
  items: readonly BookmarkItem[],
  depth: number,
  out: string[],
): number {
  let count = 0
  const indent = '  '.repeat(depth)
  for (const item of items) {
    const type = nonEmpty(item.type, 'unknown')
    if (type === 'group') {
      const groupTitle = nonEmpty(
        item.title,
        L({ ko: '(이름 없는 묶음)', en: '(untitled group)' }),
      )
      out.push(`${indent}- [group] ${groupTitle}`)
      if (Array.isArray(item.items)) {
        count += formatBookmarkItems(app, item.items, depth + 1, out)
      }
      continue
    }
    count += 1
    if (typeof item.path === 'string' && item.path.trim().length > 0) {
      const normalized = normalizePath(item.path)
      const exists = existsInVault(app, normalized)
      const status = exists
        ? L({ ko: '있음', en: 'exists' })
        : L({ ko: '없음', en: 'missing' })
      const title = nonEmpty(item.title, basenameOf(normalized))
      if (isAiPrivatePath(normalized)) {
        out.push(
          `${indent}- [${type}] ${title} (${status}, ${L({ ko: 'AI 비공개', en: 'AI-private' })})`,
        )
        continue
      }
      const target =
        typeof item.subpath === 'string' && item.subpath.length > 0
          ? `${normalized}${item.subpath}`
          : normalized
      out.push(`${indent}- [${type}] ${title} — ${target} (${status})`)
      continue
    }
    if (type === 'search' || typeof item.query === 'string') {
      const query = item.query ?? ''
      const title = nonEmpty(item.title, nonEmpty(query, '(search)'))
      out.push(`${indent}- [${type}] ${title} — query: ${query}`)
      continue
    }
    if (type === 'url' || typeof item.url === 'string') {
      const url = item.url ?? ''
      const title = nonEmpty(item.title, nonEmpty(url, '(url)'))
      out.push(`${indent}- [${type}] ${title} — url: ${url}`)
      continue
    }
    const title = nonEmpty(item.title, type)
    out.push(`${indent}- [${type}] ${title}`)
  }
  return count
}

export function executeBookmarksTool(ctx: ToolExecutionContext): ToolResult {
  const plugin = enabledCorePlugin(
    ctx.app,
    'bookmarks',
  ) as BookmarksPlugin | null
  if (!plugin) {
    return {
      kind: 'error',
      message: corePluginDisabledError('bookmarks'),
      retryAllowed: false,
    }
  }

  const rawItems = Array.isArray(plugin.items)
    ? plugin.items
    : typeof plugin.getBookmarks === 'function'
      ? plugin.getBookmarks()
      : []
  const items = Array.isArray(rawItems) ? rawItems : []

  if (items.length === 0) {
    return {
      kind: 'read',
      facts: { completeness: 'empty', total: 0, returned: 0 },
      text: L({
        ko: '등록된 북마크가 없습니다.',
        en: 'No bookmarks found.',
      }),
    }
  }

  const lines: string[] = []
  const total = formatBookmarkItems(ctx.app, items, 0, lines)
  if (total === 0) {
    return {
      kind: 'read',
      facts: { completeness: 'empty', total: 0, returned: 0 },
      text: L({
        ko: '등록된 북마크가 없습니다.',
        en: 'No bookmarks found.',
      }),
    }
  }

  return {
    kind: 'read',
    facts: { completeness: 'complete', total, returned: total },
    text: [
      L({ ko: `북마크 (${total}개):`, en: `Bookmarks (${total}):` }),
      ...lines,
      L({
        ko: '본문은 읽지 않았습니다. 노트 내용은 read_files로 읽으세요.',
        en: 'Note contents were not read. Use read_files to read bookmarked notes.',
      }),
    ].join('\n'),
  }
}
