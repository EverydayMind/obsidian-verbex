import { normalizePath } from 'obsidian'

import {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
  changeHelper,
  resolveFile,
  str,
} from './localToolCommon'

const MAX_COMBINE_FILES = 20
const MAX_COMBINE_SEPARATOR_CHARS = 4_000
const MAX_COMBINE_RESULT_CHARS = 200_000

function normalizeNewMarkdownPath(value: string): string | null {
  const normalized = normalizePath(value.trim())
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    !normalized.toLowerCase().endsWith('.md')
  )
    return null
  return normalized
}

export async function executeFileCompositionTool(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  if (tool === 'copy_file') {
    const sourceArg = str(args, 'path')
    const targetArg = str(args, 'new_path')
    if (!sourceArg || !targetArg)
      return {
        kind: 'error',
        message: 'copy_file requires "path" and "new_path".',
      }
    const sourceFile = resolveFile(sourceArg, ctx, ['md'])
    if (!sourceFile)
      return {
        kind: 'error',
        message: `Markdown source not found: ${sourceArg}`,
      }
    const target = normalizeNewMarkdownPath(targetArg)
    if (!target)
      return {
        kind: 'error',
        message: 'copy_file new_path must be a safe vault-relative .md path.',
      }
    if (normalizePath(sourceFile.path) === target)
      return {
        kind: 'error',
        message: 'copy_file source and target must differ.',
      }
    if (await ctx.app.vault.adapter.exists(target))
      return { kind: 'error', message: `Destination already exists: ${target}` }
    const sourceContent = await ctx.app.vault.cachedRead(sourceFile)
    return changeHelper('copy_file', {
      op: 'create',
      kind: 'create',
      path: target,
      before: null,
      after: sourceContent,
      sourceDependencies: [
        { path: sourceFile.path, beforeContent: sourceContent },
      ],
    })
  }

  const rawPaths = Array.isArray(args.paths) ? args.paths : []
  if (
    rawPaths.some((path) => typeof path !== 'string') ||
    rawPaths.length < 2 ||
    rawPaths.length > MAX_COMBINE_FILES ||
    rawPaths.some((path) => (path as string).trim().length === 0)
  )
    return {
      kind: 'error',
      message: `combine_files requires ${2}-${MAX_COMBINE_FILES} Markdown paths.`,
    }
  const targetArg = str(args, 'new_path')
  if (!targetArg)
    return { kind: 'error', message: 'combine_files requires "new_path".' }
  const target = normalizeNewMarkdownPath(targetArg)
  if (!target)
    return {
      kind: 'error',
      message: 'combine_files new_path must be a safe vault-relative .md path.',
    }
  const paths = (rawPaths as string[]).map((path) => normalizePath(path.trim()))
  if (new Set(paths).size !== paths.length)
    return {
      kind: 'error',
      message: 'combine_files paths must be distinct after normalization.',
    }
  if (paths.includes(target))
    return { kind: 'error', message: 'combine_files target must be new.' }
  if (await ctx.app.vault.adapter.exists(target))
    return { kind: 'error', message: `Destination already exists: ${target}` }
  const sources: { path: string; content: string }[] = []
  for (const path of paths) {
    if (!path.toLowerCase().endsWith('.md'))
      return { kind: 'error', message: `Source is not Markdown: ${path}` }
    const file = resolveFile(path, ctx, ['md'])
    if (!file)
      return { kind: 'error', message: `Markdown source not found: ${path}` }
    const content = await ctx.app.vault.cachedRead(file)
    sources.push({ path: file.path, content })
  }
  const separator =
    typeof args.separator === 'string' ? args.separator : '\n\n---\n\n'
  if (separator.length > MAX_COMBINE_SEPARATOR_CHARS)
    return {
      kind: 'error',
      message: `combine_files separator exceeds ${MAX_COMBINE_SEPARATOR_CHARS} characters.`,
    }
  const includeFilenames = args.include_filenames !== false
  const parts = sources.map(({ path, content }) =>
    includeFilenames ? `## ${path}\n${content}` : content,
  )
  const after = parts.join(separator)
  if (after.length > MAX_COMBINE_RESULT_CHARS)
    return {
      kind: 'error',
      message: `combine_files result exceeds ${MAX_COMBINE_RESULT_CHARS} characters.`,
    }
  return changeHelper('combine_files', {
    op: 'create',
    kind: 'create',
    path: target,
    before: null,
    after,
    sourceDependencies: sources.map(({ path, content }) => ({
      path,
      beforeContent: content,
    })),
  })
}
