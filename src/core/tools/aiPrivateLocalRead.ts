import { normalizePath } from 'obsidian'

import {
  asVaultPath,
  hasAiPrivateSource,
  isAiPrivatePath,
} from '../../security/aiPrivatePaths'
import {
  AiPrivateReadError,
  aiPrivateRefusalOutcome,
  findAiPrivateArg,
} from '../../security/aiPrivateRefusal'
import type { AgentToolOutcome } from '../llm/toolOutcome'

import type {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
} from './localToolCommon'
import { parseToolArgs } from './parseToolArgs'

const refusal = (path: string): ToolResult => ({
  kind: 'outcome',
  outcome: aiPrivateRefusalOutcome(path),
})

const isPathKey = (key: string) =>
  key === 'path' || key === 'paths' || key === 'source' || /_path$/i.test(key)

/**
 * Arguments that name where a built-in tool WRITES (`new_path` of the copy,
 * move, rename, extract and combine tools; `output_path` of the audit and
 * report-style tools). No tool resolves them by basename or wikilink.
 */
const DESTINATION_KEYS = new Set(['new_path', 'output_path'])

/**
 * The literal path, plus, for an argument the tool resolves to an existing
 * file to read, every file that resolution can reach: the same steps as
 * `resolveFile` (priority folder, link destination) without an extension
 * filter. A destination is judged by its literal path only, so a new file may
 * share a basename with a private one.
 */
function resolvedTargets(
  key: string,
  value: string,
  ctx: ToolExecutionContext,
): string[] {
  const raw = asVaultPath(value)
  if (!raw) return []
  const targets = [normalizePath(raw)]
  if (DESTINATION_KEYS.has(key)) return targets
  const vault = ctx.app.vault
  const priority = ctx.getPriorityFolder().trim()
  if (priority) {
    const relative = normalizePath(`${priority}/${raw}`)
    if (vault.getFileByPath?.(relative)) targets.push(relative)
  }
  const linked = ctx.app.metadataCache?.getFirstLinkpathDest?.(raw, '')
  if (linked) targets.push(linked.path)
  return targets
}

/**
 * Refuses a built-in tool call before it runs when a path argument names an
 * AI-private document or its index note, by full path, basename or wikilink.
 */
export function guardAiPrivateArgs(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): ToolResult | null {
  if (!hasAiPrivateSource()) return null
  for (const [key, value] of Object.entries(args)) {
    if (!isPathKey(key)) continue
    for (const item of Array.isArray(value) ? (value as unknown[]) : [value]) {
      if (typeof item !== 'string') continue
      const hit = resolvedTargets(key, item, ctx).find(isAiPrivatePath)
      if (hit) return refusal(hit)
    }
  }
  return null
}

/** A read point deeper in a tool met a private file after resolution. */
export function aiPrivateErrorResult(error: unknown): ToolResult | null {
  return error instanceof AiPrivateReadError ? refusal(error.path) : null
}

/** Host-run tools that take vault paths but bypass the local tool registry. */
const HOST_PATH_TOOLS = new Set([
  'prepare_format_reuse',
  'save_format_decomposition',
  'produce_format_reuse',
  'transform_large_file',
  'split_file_by_chapters',
])

export function hostToolAiPrivateRefusal(
  name: string,
  rawArguments: string | undefined,
): AgentToolOutcome | undefined {
  if (!hasAiPrivateSource() || !HOST_PATH_TOOLS.has(name)) return undefined
  const path = findAiPrivateArg(parseToolArgs(rawArguments))
  return path ? aiPrivateRefusalOutcome(path) : undefined
}
