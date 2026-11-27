import { z } from 'zod'

/**
 * Compatibility table between this host and sibling plugins (plan section
 * 10.3). It is data only: plugin ids appear in the table, never in code.
 * No obsidian runtime import, so tests can drive it with synthetic tables.
 */
export const COMPATIBILITY_FEATURES = [
  'skills',
  'extract',
  'ownership',
  'privacy',
  'bridge',
] as const
export type CompatibilityFeature = (typeof COMPATIBILITY_FEATURES)[number]

const version = z.string().regex(/^\d+\.\d+\.\d+$/)
const extension = z
  .string()
  .regex(/^\.[^./\\\s]+$/)
  .refine((value) => value === value.toLowerCase())

const entrySchema = z
  .object({
    pluginId: z.string().min(1).max(100),
    feature: z.enum(COMPATIBILITY_FEATURES),
    minVersion: version,
    severity: z.enum(['required', 'recommended']),
    messageKey: z.string().min(1).max(200),
    /** Document formats of the plugin; a privacy or ownership entry must list them. */
    extensions: z.array(extension).min(1).max(32).optional(),
  })
  .strict()
  .refine(
    (entry) =>
      (entry.feature !== 'privacy' && entry.feature !== 'ownership') ||
      !!entry.extensions,
    { message: 'privacy and ownership entries need extensions' },
  )

const tableSchema = z
  .object({ entries: z.array(entrySchema).max(200) })
  .strict()

export type CompatibilityEntry = z.infer<typeof entrySchema>
export type CompatibilityTable = z.infer<typeof tableSchema>

export type CompatibilityFinding = {
  pluginId: string
  feature: CompatibilityFeature
  severity: CompatibilityEntry['severity']
  installed: string
  required: string
  messageKey: string
  extensions?: string[]
}

export type TableParse =
  | { ok: true; table: CompatibilityTable }
  | { ok: false; reason: string }

/** A defective table is rejected whole; the caller ignores it and records why. */
export function parseCompatibilityTable(raw: unknown): TableParse {
  const parsed = tableSchema.safeParse(raw)
  if (parsed.success) return { ok: true, table: parsed.data }
  const issue = parsed.error.issues[0]
  return {
    ok: false,
    reason: `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'}`,
  }
}

/**
 * Compares the numeric `major.minor.patch` core only. A pre-release or build
 * suffix on the installed version is ignored (1.2.3-beta counts as 1.2.3).
 * An installed version that has no such core is below every minimum, so a
 * required entry then fails closed. Returns undefined for that case.
 */
export function compareVersions(
  installed: string,
  minimum: string,
): number | undefined {
  const core = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(installed.trim())
  const floor = /^(\d+)\.(\d+)\.(\d+)$/.exec(minimum)
  if (!core || !floor) return undefined
  for (let index = 1; index <= 3; index++) {
    const difference = Number(core[index]) - Number(floor[index])
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return 0
}

/** Entries whose plugin is enabled and older than the minimum (or unreadable). */
export function evaluateCompatibility(
  table: CompatibilityTable,
  enabled: readonly { id: string; version: string }[],
): CompatibilityFinding[] {
  const found: CompatibilityFinding[] = []
  for (const entry of table.entries) {
    const plugin = enabled.find((item) => item.id === entry.pluginId)
    if (!plugin) continue
    const order = compareVersions(plugin.version, entry.minVersion)
    if (order !== undefined && order >= 0) continue
    found.push({
      pluginId: entry.pluginId,
      feature: entry.feature,
      severity: entry.severity,
      installed: plugin.version,
      required: entry.minVersion,
      messageKey: entry.messageKey,
      ...(entry.extensions ? { extensions: entry.extensions } : {}),
    })
  }
  return found
}
