import { normalizePath } from 'obsidian'

import { ToolExecutionContext, ToolResult } from './localToolCommon'

export function missingMutationFile(
  tool: string,
  path: string,
  ctx: ToolExecutionContext,
): ToolResult {
  const file = ctx.app.vault.getFileByPath(normalizePath(path))
  if (file?.extension && !['md', 'base'].includes(file.extension.toLowerCase()))
    return {
      kind: 'error',
      message: `${tool} supports only .md and .base notes; "${path}" is a .${file.extension} file and was not changed. This must be done in the Obsidian file explorer.`,
    }
  return { kind: 'error', message: `File not found: ${path}` }
}
