import { exportCensusReport } from './censusExport'
import type {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
} from './localToolCommon'
import { exportPropertyQuery } from './propertyQueryExport'

export function assertQueryWorkflow(tool: string, workflow: boolean) {
  if (
    workflow &&
    ['iterative_search', 'obsidian_query', 'export_census_report'].includes(
      tool,
    )
  )
    throw new Error('Only rank.quick is callable from a workflow.')
}

export const queryExports: Record<
  string,
  (
    args: ToolArgs,
    ctx: ToolExecutionContext,
  ) => ToolResult | Promise<ToolResult>
> = {
  export_property_query: exportPropertyQuery,
  export_census_report: exportCensusReport,
}
