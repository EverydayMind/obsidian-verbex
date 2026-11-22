import {
  CANONICAL_TOOL_MAP,
  getAgentToolDefinitions,
} from '../core/tools/toolDefinitions'
import type { RequestTool } from '../types/llm/request'

/** Narrow to the directed tool (built in, else this turn's own); never send none. */
export async function directiveToolDefinitions(
  selectedToolName: string | undefined,
  tools: RequestTool[],
  project: (tools: RequestTool[]) => Promise<RequestTool[]>,
) {
  const canonicalSelectedName = selectedToolName
    ? (CANONICAL_TOOL_MAP[selectedToolName] ?? selectedToolName)
    : undefined
  if (!canonicalSelectedName)
    return { canonicalSelectedName, selectedTools: tools }
  const named = (tool: RequestTool) =>
    tool.function.name === canonicalSelectedName
  const builtIn = await project(getAgentToolDefinitions().filter(named))
  const selectedTools = builtIn.length ? builtIn : tools.filter(named)
  return {
    canonicalSelectedName,
    selectedTools: selectedTools.length ? selectedTools : tools,
  }
}
