import type {
  ChatSkillContextItem,
  ChatWorkflowContextItem,
  SkillWorkflowSelectionMode,
} from '../types/chat'
import type { SkillSummary } from '../verbex/types'

import { vaultSkillId } from './SkillLoader'

export type SkillCatalogEntry = Pick<SkillSummary, 'id' | 'name'> &
  Partial<Pick<SkillSummary, 'unusable'>>

export type StoredSkillContextEntry = Omit<ChatSkillContextItem, 'id'> & {
  id?: unknown
}

export type LegacyConversationSelectionInput = {
  skillWorkflowSelectionMode?: SkillWorkflowSelectionMode
  selectedSkillIds?: string[]
  selectedSkillNames?: readonly unknown[]
  selectedWorkflowIds?: string[]
  hasLegacySkillItems?: boolean
  messages: readonly {
    role: string
    skillContext?: readonly StoredSkillContextEntry[]
    workflowContext?: readonly ChatWorkflowContextItem[]
  }[]
}

export type RestoredConversationSelection = {
  mode: SkillWorkflowSelectionMode
  selectedSkillIds: string[] | null
  selectedWorkflowIds: string[] | null
}

/** True when a stored skill-context item already carries a canonical id. */
export function hasSkillId(skill: { id?: unknown }): skill is { id: string } {
  return typeof skill.id === 'string' && skill.id !== ''
}

/**
 * Derives a vault Skill id (`vault:<folder>`, NFC) from a legacy stored path
 * pointing to `<folder>/SKILL.md` (or lowercase `skill.md`). Returns null when
 * the path is not a vault Skill directory path.
 */
export function vaultSkillIdFromPath(storedPath: unknown): string | null {
  if (typeof storedPath !== 'string') return null
  const normalized = storedPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '')
  if (!normalized) return null
  const segments = normalized.split('/')
  if (segments.length < 2) return null
  const fileName = segments[segments.length - 1]
  if (fileName !== 'SKILL.md' && fileName !== 'skill.md') return null
  const folder = segments[segments.length - 2]
  if (!folder || folder === '.' || folder === '..') return null
  return vaultSkillId(folder)
}

/**
 * Resolves a legacy Skill display name against the current catalog by exact
 * NFC match on frontmatter `name`. When several distinct ids share the name,
 * the single usable one wins (an unedited old starter copy is unusable next to
 * the plugin Skill that replaced it); otherwise the name is ambiguous and
 * returns null.
 */
export function resolveSkillIdByName(
  name: unknown,
  catalog: readonly SkillCatalogEntry[],
): string | null {
  if (typeof name !== 'string' || name === '') return null
  const target = name.normalize('NFC')
  const matches = new Map<string, SkillCatalogEntry>()
  for (const entry of catalog) {
    if (entry.name.normalize('NFC') === target) matches.set(entry.id, entry)
  }
  if (matches.size === 1) return [...matches.keys()][0]
  const usable = [...matches.values()].filter((entry) => !entry.unusable)
  return usable.length === 1 ? usable[0].id : null
}

/**
 * A path-derived vault id that now names an unedited old starter copy (hidden
 * because a plugin ships the same Skill) moves to that plugin Skill when the
 * name identifies it uniquely; otherwise the vault id stays.
 */
function preferReplacement(
  vaultId: string,
  name: unknown,
  catalog: readonly SkillCatalogEntry[],
): string {
  const entry = catalog.find((skill) => skill.id === vaultId)
  if (entry?.unusable?.code !== 'legacy_starter_copy') return vaultId
  const byName = resolveSkillIdByName(name, catalog)
  return byName !== null && byName !== vaultId ? byName : vaultId
}

/**
 * Resolves a single stored skill-context item. Items that already have a
 * non-empty `id` pass through unchanged. Legacy items without an `id` resolve
 * by vault `path` first, then by exact NFC `name` against the catalog.
 * Unresolved items remain as display-only entries marked `missing: true` and
 * switched off (`included: false`) so they are never injected.
 */
export function resolveLegacySkillContextItem(
  item: StoredSkillContextEntry,
  catalog: readonly SkillCatalogEntry[] = [],
): ChatSkillContextItem {
  if (hasSkillId(item)) return item
  const pathId = vaultSkillIdFromPath(item.path)
  const resolvedId =
    pathId !== null
      ? preferReplacement(pathId, item.name, catalog)
      : resolveSkillIdByName(item.name, catalog)
  if (resolvedId !== null) {
    return { ...(item as ChatSkillContextItem), id: resolvedId }
  }
  return {
    ...(item as ChatSkillContextItem),
    id: '',
    included: false,
    missing: true,
  }
}

export function resolveLegacySkillContext(
  items: readonly StoredSkillContextEntry[] | undefined,
  catalog: readonly SkillCatalogEntry[] = [],
): ChatSkillContextItem[] | undefined {
  return items?.map((item) => resolveLegacySkillContextItem(item, catalog))
}

/** Maps legacy conversation-level `selectedSkillNames` to unique catalog ids. */
export function resolveLegacySkillNames(
  names: readonly unknown[] | undefined,
  catalog: readonly SkillCatalogEntry[],
): string[] {
  if (!names) return []
  const resolved: string[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const id = resolveSkillIdByName(name, catalog)
    if (id !== null && !seen.has(id)) {
      seen.add(id)
      resolved.push(id)
    }
  }
  return resolved
}

/** Reads the legacy 0.1.16 `selectedSkillNames` field from a stored record. */
export function readLegacySelectedSkillNames(
  record: unknown,
): string[] | undefined {
  if (typeof record !== 'object' || record === null) return undefined
  const raw = (record as { selectedSkillNames?: unknown }).selectedSkillNames
  if (!Array.isArray(raw)) return undefined
  return raw.filter((item): item is string => typeof item === 'string')
}

/** True when resolving a conversation's legacy Skill data needs the catalog. */
export function needsCatalogForLegacySkillResolution(input: {
  selectedSkillIds?: unknown
  selectedSkillNames?: readonly unknown[]
  messages: readonly {
    role: string
    skillContext?: readonly StoredSkillContextEntry[]
  }[]
}): boolean {
  const legacyNames =
    input.selectedSkillNames ?? readLegacySelectedSkillNames(input)
  if (
    input.selectedSkillIds === undefined &&
    legacyNames !== undefined &&
    legacyNames.length > 0
  ) {
    return true
  }
  return input.messages.some(
    (message) =>
      message.role === 'user' &&
      (message.skillContext?.some((item) => !hasSkillId(item)) ?? false),
  )
}

function lastUserSelectionFromMessages(
  messages: LegacyConversationSelectionInput['messages'],
  catalog: readonly SkillCatalogEntry[],
): {
  selectedSkillIds: string[]
  selectedWorkflowIds: string[]
  hadLegacyItems: boolean
} | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user') continue
    if (!message.skillContext && !message.workflowContext) continue
    const hadLegacyItems =
      message.skillContext?.some((item) => !hasSkillId(item)) ?? false
    const resolved = resolveLegacySkillContext(message.skillContext, catalog)
    const selectedSkillIds =
      resolved
        ?.filter((skill) => skill.included && !skill.missing && skill.id !== '')
        .map((skill) => skill.id) ?? []
    const includedWorkflows = message.workflowContext
      ?.filter((workflow) => workflow.included)
      .map((workflow) => workflow.id)
    const selectedWorkflowIds =
      includedWorkflows?.length === 1 ? includedWorkflows : []
    return {
      selectedSkillIds,
      selectedWorkflowIds,
      hadLegacyItems,
    }
  }
  return null
}

function hasAnyLegacySkillItem(
  input: LegacyConversationSelectionInput,
): boolean {
  if (input.hasLegacySkillItems) return true
  return input.messages.some(
    (message) =>
      message.role === 'user' &&
      (message.skillContext?.some((item) => !hasSkillId(item)) ?? false),
  )
}

/**
 * Restores a conversation's Skill/Workflow selection and mode. Current-format
 * conversations (`selectedSkillIds` present, or message items with `id`) behave
 * identically to before. Legacy 0.1.16 conversations map `selectedSkillNames`
 * and legacy message items, falling back to `auto` / `null` (no empty lock)
 * when nothing resolves.
 */
export function restoreConversationSkillSelection(
  input: LegacyConversationSelectionInput,
  catalog: readonly SkillCatalogEntry[] = [],
): RestoredConversationSelection {
  if (input.selectedSkillIds !== undefined) {
    return {
      mode: input.skillWorkflowSelectionMode ?? 'locked',
      selectedSkillIds: input.selectedSkillIds,
      selectedWorkflowIds: input.selectedWorkflowIds ?? [],
    }
  }

  const legacyNames =
    input.selectedSkillNames ?? readLegacySelectedSkillNames(input)
  if (legacyNames !== undefined) {
    const resolvedSkillIds = resolveLegacySkillNames(legacyNames, catalog)
    const workflowIds = input.selectedWorkflowIds ?? []
    if (resolvedSkillIds.length === 0 && workflowIds.length === 0) {
      return {
        mode: 'auto',
        selectedSkillIds: null,
        selectedWorkflowIds: null,
      }
    }
    return {
      mode: input.skillWorkflowSelectionMode ?? 'locked',
      selectedSkillIds: resolvedSkillIds,
      selectedWorkflowIds: workflowIds,
    }
  }

  if (input.selectedWorkflowIds !== undefined) {
    if (input.selectedWorkflowIds.length > 0 || !hasAnyLegacySkillItem(input)) {
      return {
        mode: input.skillWorkflowSelectionMode ?? 'locked',
        selectedSkillIds: [],
        selectedWorkflowIds: input.selectedWorkflowIds,
      }
    }
  }

  const last = lastUserSelectionFromMessages(input.messages, catalog)
  if (!last) {
    return {
      mode: input.skillWorkflowSelectionMode ?? 'auto',
      selectedSkillIds: null,
      selectedWorkflowIds: null,
    }
  }

  const isLegacy = input.hasLegacySkillItems === true || last.hadLegacyItems
  if (
    isLegacy &&
    last.selectedSkillIds.length === 0 &&
    last.selectedWorkflowIds.length === 0
  ) {
    return {
      mode: 'auto',
      selectedSkillIds: null,
      selectedWorkflowIds: null,
    }
  }

  return {
    mode: input.skillWorkflowSelectionMode ?? 'locked',
    selectedSkillIds: last.selectedSkillIds,
    selectedWorkflowIds: last.selectedWorkflowIds,
  }
}
