import {
  CANONICAL_TOOL_MAP,
  TOOL_REGISTRY,
} from '../core/tools/toolDefinitions'

/**
 * Canonical list of Verbex Local Tool names (PRD §13).
 */
export const VERBEX_TOOL_NAMES = [
  ...Object.entries(TOOL_REGISTRY)
    .filter(([_, entry]) => entry.workflowCallable)
    .map(([name]) => name),
  ...Object.keys(CANONICAL_TOOL_MAP),
]

export type VerbexToolName = string

export const VERBEX_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  VERBEX_TOOL_NAMES,
)
