import type {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
} from '../tools/localToolCommon'

import { calculateTool } from './calculateTool'
import { dateCalc } from './dateCalc'
import { validateDateArgs } from './dateCalcArgs'
import { auditLinks } from './linkAudit'
import { executeNoteQuery } from './noteQueryTools'
import * as calculationText from './vaultCalculationText'

export async function executeVaultFactTool(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  if (tool === 'audit_links') return auditLinks(args, ctx)
  if (tool === 'query_notes' || tool === 'list_tasks')
    return executeNoteQuery(tool, args, ctx)
  if (ctx.signal?.aborted)
    return {
      kind: 'error',
      message: calculationText.calculationAborted(),
    }
  try {
    if (tool === 'calculate') return calculateTool(args)
    validateDateArgs(args)
    return {
      kind: 'read',
      text: dateCalc(args),
    }
  } catch (error) {
    return {
      kind: 'error',
      message:
        error instanceof Error
          ? error.message
          : calculationText.calculationFallback(),
    }
  }
}
