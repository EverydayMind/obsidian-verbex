import { normalizePath } from 'obsidian'

import {
  assertUserVaultPath,
  isAllowedHiddenConfigPath,
} from '../../security/vaultPathPolicy'

import { ToolExecutionContext, resolveFile } from './localToolCommon'

export function resolveReadablePathFile(
  path: string,
  ctx: ToolExecutionContext,
) {
  try {
    const normalized = assertUserVaultPath(ctx.app, normalizePath(path))
    const allowed = (p: string) => {
      const lower = p.toLowerCase()
      return (
        !(lower === '.verbex' || lower.startsWith('.verbex/')) ||
        (!!ctx.configFolders &&
          isAllowedHiddenConfigPath(ctx.app, p, ctx.configFolders))
      )
    }
    if (!allowed(normalized)) return null
    const file = resolveFile(normalized, ctx, [])
    if (!file || !allowed(file.path)) return null
    assertUserVaultPath(ctx.app, file.path)
    return file
  } catch {
    return null
  }
}
