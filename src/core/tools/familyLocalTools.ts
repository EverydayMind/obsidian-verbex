import { executeCoreTool, isCoreTool } from '../obsidian-core/coreLocalTools'
import { TidyLedger, executeTidyTool, isTidyTool } from '../tidy/tidyLocalTools'
import { executeVaultFactTool } from '../vault-facts/vaultFactLocalTools'
import { isVaultFactTool } from '../vault-facts/vaultFactTools'

import type {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
} from './localToolCommon'

export { TidyLedger }

export function executeFamilyTool(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
  tidyLedger: TidyLedger,
): Promise<ToolResult> | undefined {
  if (isTidyTool(tool)) return executeTidyTool(tool, args, ctx, tidyLedger)
  if (isVaultFactTool(tool)) return executeVaultFactTool(tool, args, ctx)
  if (isCoreTool(tool)) return executeCoreTool(tool, args, ctx)
  return undefined
}
