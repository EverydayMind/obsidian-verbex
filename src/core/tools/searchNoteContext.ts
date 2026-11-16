import { normalizePath } from 'obsidian'

import { L } from '../../i18n/modelText'
import {
  ResolvedLinks,
  backlinks,
  collectTagIndex,
  headingOutline,
  noteTags,
  outgoingLinks,
  unresolvedFor,
} from '../../utils/vault-relations'

import {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
  resolveFile,
  str,
} from './localToolCommon'

export function executeNoteContext(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): ToolResult {
  const fileForPath = (path: string) => resolveFile(path, ctx, ['md'])
  const path = str(args, 'path')
  if (!path) return { kind: 'error', message: 'note_context requires "path".' }
  const file = fileForPath(normalizePath(path))
  if (!file)
    return {
      kind: 'read',
      text: L({
        ko: `(노트를 찾지 못했습니다: ${path})`,
        en: `(Note not found: ${path})`,
      }),
    }
  // Link maps are keyed by the resolved file path, not the requested one.
  const normalized = file.path
  const resolvedLinks: ResolvedLinks =
    ctx.app.metadataCache?.resolvedLinks ?? {}
  const unresolvedLinks: ResolvedLinks =
    ctx.app.metadataCache?.unresolvedLinks ?? {}
  const outs = outgoingLinks(resolvedLinks, normalized)
  const ins = backlinks(resolvedLinks, normalized)
  const unres = unresolvedFor(unresolvedLinks, normalized)
  const tags = noteTags(ctx.app, file).sort()
  const cache = ctx.app.metadataCache.getFileCache(file)
  const aliasesRaw: unknown = cache?.frontmatter?.aliases
  const aliases = Array.isArray(aliasesRaw)
    ? aliasesRaw.map(String)
    : typeof aliasesRaw === 'string'
      ? [aliasesRaw]
      : []
  const headings = headingOutline(ctx.app, file)
  const parentDir = normalized.includes('/')
    ? normalized.slice(0, normalized.lastIndexOf('/'))
    : ''
  const siblings = parentDir
    ? ctx.app.vault
        .getMarkdownFiles()
        .filter(
          (f) => f.path.startsWith(`${parentDir}/`) && f.path !== normalized,
        )
        .map((f) => f.path)
        .sort()
    : []

  const index = collectTagIndex(ctx.app)
  const shared: string[] = []
  for (const tag of tags) {
    const tagged = index.get(tag) ?? []
    for (const t of tagged) {
      if (t !== normalized) shared.push(`${t} (#${tag})`)
    }
  }
  shared.sort()

  const fmt = (refs: { path: string; count: number }[], cap = 25): string =>
    refs.length === 0
      ? L({ ko: '(없음)', en: '(none)' })
      : refs
          .slice(0, cap)
          .map((r) => `${r.path} (${r.count})`)
          .join(', ') + (refs.length > cap ? `, …+${refs.length - cap}` : '')
  const lines = [
    L({ ko: `노트: ${normalized}`, en: `Note: ${normalized}` }),
    tags.length > 0
      ? L({
          ko: `태그: ${tags.map((t) => `#${t}`).join(' ')}`,
          en: `Tags: ${tags.map((t) => `#${t}`).join(' ')}`,
        })
      : null,
    aliases.length > 0
      ? L({
          ko: `별칭(alias): ${aliases.join(', ')}`,
          en: `Aliases: ${aliases.join(', ')}`,
        })
      : null,
    L({
      ko: `아웃링크(${outs.length}): ${fmt(outs)}`,
      en: `Outgoing links (${outs.length}): ${fmt(outs)}`,
    }),
    L({
      ko: `백링크(${ins.length}): ${fmt(ins)}`,
      en: `Backlinks (${ins.length}): ${fmt(ins)}`,
    }),
    unres.length > 0
      ? L({
          ko: `미해결 링크(${unres.length}): ${fmt(unres)}`,
          en: `Unresolved links (${unres.length}): ${fmt(unres)}`,
        })
      : null,
    shared.length > 0
      ? L({
          ko: `공유 태그 노트: ${shared.join(', ')}`,
          en: `Notes sharing tags: ${shared.join(', ')}`,
        })
      : null,
    siblings.length > 0
      ? L({
          ko: `같은 폴더(${siblings.length}): ${siblings.slice(0, 25).join(', ')}${siblings.length > 25 ? ', …' : ''}`,
          en: `Same folder (${siblings.length}): ${siblings.slice(0, 25).join(', ')}${siblings.length > 25 ? ', …' : ''}`,
        })
      : null,
    headings.length > 0
      ? L({
          ko: `구조:\n${headings
            .map(
              (h) => `${'  '.repeat(Math.max(0, h.level - 1))}- ${h.heading}`,
            )
            .join('\n')}`,
          en: `Structure:\n${headings
            .map(
              (h) => `${'  '.repeat(Math.max(0, h.level - 1))}- ${h.heading}`,
            )
            .join('\n')}`,
        })
      : null,
  ].filter(Boolean)

  return { kind: 'read', text: lines.join('\n') }
}
