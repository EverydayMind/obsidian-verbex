import {
  SIMPLE_CORE_TOOL_NAMES,
  canonicalToolName,
} from '../core/tools/toolDefinitions'
import type { RequestTool } from '../types/llm/request'

export type ConversationToolSelection = {
  pinned?: readonly string[]
  excluded?: readonly string[]
}

export function applyConversationToolSelection(
  selected: readonly RequestTool[],
  available: readonly RequestTool[],
  selection: ConversationToolSelection,
  required: readonly string[] = [],
): RequestTool[] {
  const protectedNames = new Set([
    ...SIMPLE_CORE_TOOL_NAMES,
    ...required.map(canonicalToolName),
  ])
  const names = new Set([
    ...selected.map((tool) => tool.function.name),
    ...(selection.pinned ?? []).map(canonicalToolName),
    ...required.map(canonicalToolName),
  ])
  const excluded = new Set((selection.excluded ?? []).map(canonicalToolName))
  return available.filter(
    (tool) =>
      names.has(tool.function.name) &&
      (!excluded.has(tool.function.name) ||
        protectedNames.has(tool.function.name)),
  )
}
