import { canonicalToolName } from '../core/tools/toolDefinitions'
import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'

/**
 * Enforcement of the skill frontmatter scoping fields that were previously
 * parsed but never applied (B-3): `applies_to` (which editor contexts the skill
 * is written for) and `allowed-tools` (which tools the skill may use).
 *
 * Both are author declarations on a SKILL.md. Until now they were loaded into
 * the skill summary and dropped, so a markdown-only skill would still inject its
 * body while the user edited a `.canvas`, and a tool-scoped skill imposed no
 * scope at all. These helpers make the declarations take effect at the point the
 * skill is injected into the prompt.
 */

/**
 * Maps an active file's extension to the `applies_to` context vocabulary used in
 * skill frontmatter (`markdown` / `canvas` / `base` / `hwp` / `hwpx`). Returns null for an
 * unknown or absent extension, which callers treat as "context unknown — do not
 * filter", so a skill is never suppressed just because the active file type
 * could not be classified.
 */
export function contextTypeFromExtension(
  extension?: string | null,
): string | null {
  if (!extension) {
    return null
  }
  switch (
    extension
      .trim()
      .toLowerCase()
      .replace(/^(?:\*\.)|^\./, '')
  ) {
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'canvas':
      return 'canvas'
    case 'base':
      return 'base'
    case 'hwp':
      return 'hwp'
    case 'hwpx':
      return 'hwpx'
    default:
      return null
  }
}

/**
 * Whether a skill applies in the active editor context. A skill with no
 * `applies_to` (or an empty list) is unscoped and always applies. When the skill
 * declares contexts, it applies only if the active context is one of them — but
 * an unknown active context (null) never suppresses the skill, so the gate is
 * conservative: it only drops a skill when the active file type is known and the
 * author explicitly excluded it.
 */
export function skillAppliesToContext(
  appliesTo: string[] | undefined,
  activeContextType: string | null | undefined,
): boolean {
  if (!appliesTo || appliesTo.length === 0) {
    return true
  }
  if (!activeContextType) {
    return true
  }
  const normalize = (type: string) =>
    contextTypeFromExtension(type) ?? type.trim().toLowerCase()
  const normalized = normalize(activeContextType)
  return appliesTo.some((type) => normalize(type) === normalized)
}

/**
 * A model-visible directive limiting the agent to a skill's declared
 * `allowed-tools` while that skill is active, or null when the skill declares no
 * restriction (absent or empty list). This enforces the declaration as an
 * explicit instruction rather than by stripping tool schemas — an empty list is
 * treated as "unspecified" (no restriction), so a writing skill that omits a
 * tool list is never accidentally blocked from saving its output.
 */
export function allowedToolsDirective(
  allowedTools: string[] | undefined,
  locale: ModelLocale = getModelLocale(),
): string | null {
  const tools = [
    ...new Set(
      (allowedTools ?? [])
        .map((tool) => canonicalToolName(tool.trim()))
        .filter(Boolean),
    ),
  ]
  if (tools.length === 0) {
    return null
  }
  return L(
    {
      ko: `[도구 제한] 이 스킬 작업에는 다음 도구만 사용하세요: ${tools.join(', ')}.`,
      en: `[Tool restriction] For this skill task, use only these tools: ${tools.join(', ')}.`,
    },
    locale,
  )
}
