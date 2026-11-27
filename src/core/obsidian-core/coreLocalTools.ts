import type {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
} from '../tools/localToolCommon'

import { executeBookmarksTool } from './bookmarksTool'
import { executeEditCanvasTool } from './canvasEditTool'
import { executeReadCanvasTool } from './canvasReadTool'
import { isCoreTool } from './coreTools'
import { executeDailyNoteTool } from './dailyNoteTool'
import { executeOpenInObsidianTool } from './openInObsidianTool'
import { executeTemplateTool } from './templateTool'

export { isCoreTool }

export async function executeCoreTool(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  switch (tool) {
    case 'daily_note':
      return executeDailyNoteTool(args, ctx)
    case 'create_from_template':
      return executeTemplateTool(args, ctx)
    case 'list_bookmarks':
      return executeBookmarksTool(ctx)
    case 'open_in_obsidian':
      return executeOpenInObsidianTool(args, ctx)
    case 'read_canvas':
      return executeReadCanvasTool(args, ctx)
    case 'edit_canvas':
      return executeEditCanvasTool(args, ctx)
    default:
      return { kind: 'error', message: `Unknown core tool: ${tool}` }
  }
}
