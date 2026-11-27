import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import {
  assertUserVaultPath,
  isAllowedHiddenConfigPath,
} from '../../security/vaultPathPolicy'
import {
  ParsedObsidianQuery,
  matchesObsidianMetadata,
} from '../../utils/obsidian-query'

import { ToolExecutionContext } from './localToolCommon'
import { LINE_LIMITS } from './obsidianQueryLinesScan'
import {
  LineTarget,
  LinesError,
  QuerySession,
} from './obsidianQueryLinesSession'

export function linesPolicy(ctx: ToolExecutionContext): string {
  return JSON.stringify([
    'lines-v1',
    ctx.app.vault.configDir,
    ctx.configFolders?.skillsFolder,
    ctx.configFolders?.workflowsFolder,
    ctx.configFolders?.promptsFolder,
  ])
}
export function linePathAllowed(
  path: string,
  ctx: ToolExecutionContext,
): boolean {
  try {
    assertUserVaultPath(ctx.app, path)
  } catch {
    return false
  }
  if (isAiPrivatePath(path)) return false
  return (
    !/^\.verbex(?:\/|$)/i.test(path) ||
    (!!ctx.configFolders &&
      isAllowedHiddenConfigPath(ctx.app, path, ctx.configFolders))
  )
}
export function lineTargets(
  ctx: ToolExecutionContext,
  parsed: ParsedObsidianQuery,
): LineTarget[] {
  const targets: LineTarget[] = []
  for (const file of ctx.app.vault.getMarkdownFiles()) {
    if (ctx.signal?.aborted) throw new LinesError('aborted')
    if (!linePathAllowed(file.path, ctx)) continue
    const cache = ctx.app.metadataCache.getFileCache(file)
    if (!matchesObsidianMetadata(file, cache, parsed)) continue
    targets.push({
      file,
      path: file.path,
      mtime: file.stat.mtime,
      size: file.stat.size,
    })
    if (targets.length > LINE_LIMITS.targets) throw new LinesError('targets')
  }
  return targets
}

/** Recheck all targets, including completed notes, before even a cached return. */
export function validateLinesSession(
  s: QuerySession,
  ctx: ToolExecutionContext,
) {
  if (s.policy !== linesPolicy(ctx)) {
    s.invalidated = ''
    throw new LinesError('invalidated')
  }
  const files = new Map(
    ctx.app.vault.getMarkdownFiles().map((f) => [f.path, f]),
  )
  for (const target of s.targets) {
    const file = files.get(target.path)
    if (
      !file ||
      file !== target.file ||
      file.stat.mtime !== target.mtime ||
      file.stat.size !== target.size ||
      !linePathAllowed(target.path, ctx) ||
      !matchesObsidianMetadata(
        file,
        ctx.app.metadataCache.getFileCache(file),
        s.parsed,
      )
    ) {
      s.invalidated = target.path
      s.active = undefined
      s.pending = undefined
      s.pages.clear()
      throw new LinesError('invalidated', target.path)
    }
  }
}
