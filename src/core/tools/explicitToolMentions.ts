import { ENGLISH_NATIVE_TOOL_TITLES } from '../../tools/nativeToolAliases'
import { NATIVE_TOOL_TITLES } from '../../tools/nativeToolTitles'

import {
  AGENT_CALLABLE_TOOL_NAMES,
  CANONICAL_TOOL_MAP,
  canonicalToolName,
} from './toolCatalogRegistry'

/** Input selection only; exposure, approval and budget checks still apply. */
export function explicitlyNamedTools(text: string): string[] {
  const selected = new Set<string>()
  for (const name of new Set([
    ...AGENT_CALLABLE_TOOL_NAMES,
    ...Object.keys(CANONICAL_TOOL_MAP),
  ])) {
    if (new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'i').test(text))
      selected.add(canonicalToolName(name))
  }
  const normalized = text.replace(/\s+/g, ' ').toLowerCase()
  for (const [name, title] of Object.entries(ENGLISH_NATIVE_TOOL_TITLES)) {
    const escaped = title.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (
      AGENT_CALLABLE_TOOL_NAMES.has(name) &&
      new RegExp(`\\b${escaped}\\b`).test(normalized)
    )
      selected.add(canonicalToolName(name))
  }
  for (const [name, title] of Object.entries(NATIVE_TOOL_TITLES)) {
    if (
      AGENT_CALLABLE_TOOL_NAMES.has(name) &&
      normalized.includes(title.toLowerCase())
    )
      selected.add(canonicalToolName(name))
  }
  return [...selected].filter((name) => AGENT_CALLABLE_TOOL_NAMES.has(name))
}
