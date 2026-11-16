import type { ToolArgs, ToolResult } from '../tools/localToolCommon'

import { calculate } from './calculate'
import { expressionError } from './calculationArgumentText'

export function calculateTool(args: ToolArgs): ToolResult {
  if (
    Object.keys(args).some((key) => key !== 'expression') ||
    typeof args.expression !== 'string' ||
    !args.expression.trim() ||
    args.expression.length > 500
  )
    throw new Error(expressionError())
  return { kind: 'read', text: calculate(args.expression) }
}
