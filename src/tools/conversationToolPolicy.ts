import {
  SIMPLE_CORE_TOOL_NAMES,
  canonicalToolName,
} from '../core/tools/toolDefinitions'
import type { RequestTool } from '../types/llm/request'

import { migrateStoredToolNames } from './storedToolNames'

export type ConversationToolSelection = {
  pinned?: readonly string[]
  excluded?: readonly string[]
}

export function storedRequiredToolNames(
  skills: readonly { tools?: string[] }[],
  workflows: readonly {
    included?: boolean
    steps?: readonly { tool?: string }[]
  }[],
): string[] {
  return migrateStoredToolNames([
    ...skills.flatMap((skill) => skill.tools ?? []),
    ...workflows
      .filter((workflow) => workflow.included === true)
      .flatMap(
        (workflow) =>
          workflow.steps?.flatMap((step) => (step.tool ? [step.tool] : [])) ??
          [],
      ),
  ]).map(canonicalToolName)
}

export function applyConversationToolSelection(
  selected: readonly RequestTool[],
  available: readonly RequestTool[],
  selection: ConversationToolSelection,
  required: readonly string[] = [],
): RequestTool[] {
  const protectedNames = new Set([
    ...SIMPLE_CORE_TOOL_NAMES,
    ...migrateStoredToolNames(required).map(canonicalToolName),
  ])
  const names = new Set([
    ...selected.map((tool) => tool.function.name),
    ...migrateStoredToolNames(selection.pinned ?? []).map(canonicalToolName),
    ...migrateStoredToolNames(required).map(canonicalToolName),
  ])
  const excluded = new Set(
    migrateStoredToolNames(selection.excluded ?? [], true).map(
      canonicalToolName,
    ),
  )
  return available.filter(
    (tool) =>
      names.has(tool.function.name) &&
      (!excluded.has(tool.function.name) ||
        protectedNames.has(tool.function.name)),
  )
}
