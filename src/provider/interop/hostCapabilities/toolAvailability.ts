import { copyJson, readDataMember } from '../descriptorReader'

/**
 * host-capabilities-v1 section 8: `toolAvailability()`. A provider's hide-only
 * list of its own tools that cannot work right now. It never adds, grants or
 * approves anything and is not part of the approval digest.
 */
export const TOOL_AVAILABILITY_MAX_ENTRIES = 64
export const TOOL_AVAILABILITY_REASON_MAX = 200
const COPY_LIMITS = { maxDepth: 4, maxNodes: 1_000, maxBytes: 128 * 1024 }

export type UnavailableTool = { name: string; reason: string }

export type ToolAvailabilityRead =
  | { ok: true; unavailable: UnavailableTool[] }
  | { ok: false }

const IGNORED = { ok: false } as const
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Cs}]/gu

/**
 * Plain text for people: control, format and unpaired surrogate characters
 * removed, trimmed, at most 200 UTF-16 units (never splitting a pair).
 */
export function cleanAvailabilityReason(text: string): string {
  const plain = text.replace(UNSAFE_TEXT, '').trim()
  if (plain.length <= TOOL_AVAILABILITY_REASON_MAX) return plain
  let end = TOOL_AVAILABILITY_REASON_MAX
  const last = plain.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return plain.slice(0, end).trim()
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function sameKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(value)
  return own.length === keys.length && keys.every((key) => key in value)
}

/**
 * Strict parse of an already JSON-copied result. Any structural defect (not an
 * object, other keys, unknown version, a non-array list, an entry that is not
 * exactly `{ name, reason }` of two strings) ignores the whole member. Entries
 * naming tools outside `known`, repeats, and entries beyond 64 are dropped.
 */
export function parseToolAvailability(
  raw: unknown,
  known: ReadonlySet<string>,
): ToolAvailabilityRead {
  if (!isPlainRecord(raw) || !sameKeys(raw, ['version', 'unavailable']))
    return IGNORED
  if (raw.version !== 1 || !Array.isArray(raw.unavailable)) return IGNORED
  const seen = new Set<string>()
  const unavailable: UnavailableTool[] = []
  for (const entry of raw.unavailable) {
    if (!isPlainRecord(entry) || !sameKeys(entry, ['name', 'reason']))
      return IGNORED
    if (typeof entry.name !== 'string' || typeof entry.reason !== 'string')
      return IGNORED
  }
  for (const entry of raw.unavailable as UnavailableTool[]) {
    if (unavailable.length >= TOOL_AVAILABILITY_MAX_ENTRIES) break
    if (!known.has(entry.name) || seen.has(entry.name)) continue
    seen.add(entry.name)
    unavailable.push({
      name: entry.name,
      reason: cleanAvailabilityReason(entry.reason),
    })
  }
  return { ok: true, unavailable }
}

/**
 * Reads the member live, without running provider code other than the member
 * itself: a data member (never a getter) that is a function, called with no
 * arguments, whose synchronous result is copied as plain JSON. Anything else,
 * including a throw or a Promise, means "all tools available".
 */
export function readToolAvailability(
  receiver: object,
  known: ReadonlySet<string>,
): UnavailableTool[] {
  try {
    const call = readDataMember(receiver, 'toolAvailability')
    if (typeof call !== 'function') return []
    const result: unknown = Reflect.apply(call, receiver, [])
    const parsed = parseToolAvailability(copyJson(result, COPY_LIMITS), known)
    return parsed.ok ? parsed.unavailable : []
  } catch {
    return []
  }
}
