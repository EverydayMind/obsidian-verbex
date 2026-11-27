import { type App, type TFile, normalizePath } from 'obsidian'

import {
  assertUserVaultPath,
  isAllowedHiddenConfigPath,
} from '../../security/vaultPathPolicy'
import type { ToolExecutionContext } from '../tools/localToolCommon'

/** Exact vault file match (never falls back to link/basename resolution). */
export function exactVaultFile(app: App, path: string): TFile | null {
  const normalized = normalizePath(path)
  const direct = app.vault.getAbstractFileByPath?.(normalized)
  if (
    direct &&
    typeof (direct as TFile).extension === 'string' &&
    normalizePath(direct.path) === normalized
  ) {
    return direct as TFile
  }
  if (!app.vault.getAbstractFileByPath) {
    const byPath = app.vault.getFileByPath?.(normalized)
    if (byPath && normalizePath(byPath.path) === normalized) return byPath
    return (
      app.vault
        .getMarkdownFiles?.()
        .find((file) => normalizePath(file.path) === normalized) ?? null
    )
  }
  return null
}

/** Exact Markdown (.md) file match. */
export function exactMarkdownFile(app: App, path: string): TFile | null {
  const file = exactVaultFile(app, path)
  return file && file.extension === 'md' ? file : null
}

/** Validates a user-writable vault path and blocks hidden `.verbex` internals. */
export function assertSafeWritePath(
  ctx: ToolExecutionContext,
  rawPath: string,
): string {
  const valid = assertUserVaultPath(ctx.app, rawPath)
  const lower = valid.toLowerCase()
  if (
    (lower === '.verbex' || lower.startsWith('.verbex/')) &&
    (!ctx.configFolders ||
      !isAllowedHiddenConfigPath(ctx.app, valid, ctx.configFolders))
  ) {
    throw new Error('Internal configuration path denied.')
  }
  return normalizePath(valid)
}
