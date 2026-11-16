import { App, normalizePath } from 'obsidian'

import { visibleVaultFiles } from '../tools/fileListing'
import type {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
} from '../tools/localToolCommon'

import { appendQuotes, mentionsName, quoteNote } from './fileMentionQuotes'
import * as modelText from './fileMentionsText'

export { mentionsName } from './fileMentionQuotes'

export async function appendFileMentions(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
  result: ToolResult,
): Promise<ToolResult> {
  const mention =
    tool === 'read_file' &&
    result.kind === 'read' &&
    typeof args.path === 'string'
      ? await fileMentions(
          ctx.app,
          normalizePath(args.path).replace(/^\.\//, ''),
          ctx.signal,
        )
      : null
  return mention && result.kind === 'read'
    ? { ...result, text: `${result.text}\n${mention.text}` }
    : result
}

export function mentionLine(
  folder: string,
  name: string,
  paths: string[],
  duplicates: number,
  limited?: number,
): { line: string; shownPaths: string[] } {
  const prefix = modelText.folder(folder || '/')
  const suffix = duplicates > 1 ? modelText.duplicates(duplicates) : ''
  if (limited !== undefined)
    return {
      line: modelText.limited(prefix, limited, suffix).slice(0, 600),
      shownPaths: [],
    }
  const base = paths.length
    ? modelText.found(prefix, name, paths.length)
    : modelText.empty(prefix, name)
  const shownPaths: string[] = []
  for (const path of paths.slice(0, 5)) {
    const candidate = [...shownPaths, path].join(', ')
    if (base.length + candidate.length + suffix.length + 1 > 600) break
    shownPaths.push(path)
  }
  const omitted = shownPaths.length < paths.length
  let line = base + shownPaths.join(', ') + (omitted ? '…' : '') + suffix
  if (line.length > 600) line = line.slice(0, 599) + '…'
  return { line, shownPaths }
}

export async function fileMentions(
  app: App,
  path: string,
  signal?: AbortSignal,
  current: () => boolean = () => true,
): Promise<{ text: string; shownPaths: string[] } | null> {
  try {
    return await collectFileMentions(app, path, signal, current)
  } catch (error) {
    if (signal?.aborted || !current()) throw error
    return null
  }
}

async function collectFileMentions(
  app: App,
  path: string,
  signal: AbortSignal | undefined,
  current: () => boolean,
): Promise<{ text: string; shownPaths: string[] } | null> {
  if (!/\.(csv|tsv)$/i.test(path)) return null
  const files = visibleVaultFiles(app)
  const target = files.find((file) => file.path === path)
  if (!target) return null
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const notes = files
    .filter(
      (file) =>
        file.extension.toLowerCase() === 'md' &&
        (folder
          ? file.path.startsWith(`${folder}/`)
          : !file.path.includes('/')),
    )
    .sort((a, b) => a.path.localeCompare(b.path, 'ko'))
  const duplicates = app.vault
    .getFiles()
    .filter((file) => file.name === target.name).length
  if (
    notes.length > 500 ||
    notes.reduce((sum, file) => sum + file.stat.size, 0) > 5 * 1024 * 1024
  )
    return {
      text: mentionLine(folder, target.name, [], duplicates, notes.length).line,
      shownPaths: [],
    }
  const paths: string[] = []
  const contents = new Map<string, string>()
  for (const note of notes) {
    if (signal?.aborted || !current()) throw new Error('cancelled')
    const text = await app.vault.cachedRead(note)
    if (signal?.aborted || !current()) throw new Error('cancelled')
    if (
      (app.metadataCache.resolvedLinks[note.path]?.[target.path] ?? 0) > 0 ||
      mentionsName(text, target.name)
    ) {
      paths.push(note.path)
      contents.set(note.path, text)
    }
  }
  const result = mentionLine(folder, target.name, paths, duplicates)
  return {
    text: appendQuotes(
      result.line,
      result.shownPaths.map((note) =>
        quoteNote(note, contents.get(note) ?? '', target.name),
      ),
    ),
    shownPaths: result.shownPaths,
  }
}
