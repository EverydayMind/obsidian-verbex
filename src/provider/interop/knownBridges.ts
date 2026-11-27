import { z } from 'zod'

import { L } from '../../i18n/modelText'

import bundled from './knownBridges.json'

/**
 * Bridge hint table (plan section 4.1, D3). It is data only: plugin ids appear
 * in the JSON, never in a code branch. It feeds the chat notice that suggests a
 * Bridge and the refusal text for a tool name that moved into a Bridge. It is
 * never consulted for exposure, execution or approval. No obsidian runtime
 * import, so tests can drive it with synthetic tables.
 */
const pluginId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/)
const toolName = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)

const entrySchema = z
  .object({
    targetPluginId: pluginId,
    bridgeId: pluginId,
    name: z.string().min(1).max(100),
    messageKey: z.string().min(1).max(200),
    /** Built-in tool names that this Bridge now provides under its own tools. */
    retiredTools: z.array(toolName).max(32),
  })
  .strict()

const tableSchema = z
  .object({ entries: z.array(entrySchema).max(50) })
  .strict()
  .refine(
    (table) => {
      const names = table.entries.flatMap((entry) => entry.retiredTools)
      const bridges = table.entries.map((entry) => entry.bridgeId)
      return (
        new Set(names).size === names.length &&
        new Set(bridges).size === bridges.length
      )
    },
    { message: 'bridge ids and retired tool names must be unique' },
  )

export type KnownBridge = z.infer<typeof entrySchema>
export type KnownBridgesTable = z.infer<typeof tableSchema>
export type KnownBridgesParse =
  | { ok: true; table: KnownBridgesTable }
  | { ok: false; reason: string }

/** A defective table is rejected whole; the caller ignores it and records why. */
export function parseKnownBridges(raw: unknown): KnownBridgesParse {
  const parsed = tableSchema.safeParse(raw)
  if (parsed.success) return { ok: true, table: parsed.data }
  const issue = parsed.error.issues[0]
  return {
    ok: false,
    reason: `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'}`,
  }
}

let override: unknown
let overridden = false
let memo: { raw: unknown; parsed: KnownBridgesParse } | undefined
let reported: string | undefined

/** Tests only: replace (or with no argument, restore) the table. */
export function overrideKnownBridges(...raw: [] | [unknown]): void {
  overridden = raw.length > 0
  override = raw[0]
  reported = undefined
}

const EMPTY: KnownBridgesTable = { entries: [] }

/** A defective table is ignored whole (no notice, no refusal text). */
export function activeKnownBridges(): KnownBridgesTable {
  const raw = overridden ? override : bundled
  const current: { raw: unknown; parsed: KnownBridgesParse } =
    memo && memo.raw === raw ? memo : { raw, parsed: parseKnownBridges(raw) }
  memo = current
  const parsed: KnownBridgesParse = current.parsed
  if (!parsed.ok && reported !== parsed.reason) {
    reported = parsed.reason
    console.warn(`Verbex known-bridges table ignored: ${parsed.reason}`)
  }
  return parsed.ok ? parsed.table : EMPTY
}

/** Bridges whose target plugin is enabled while no enabled plugin is the Bridge. */
export function missingBridges(
  table: KnownBridgesTable,
  enabledIds: readonly string[],
): KnownBridge[] {
  const enabled = new Set(enabledIds)
  return table.entries.filter(
    (entry) =>
      enabled.has(entry.targetPluginId) && !enabled.has(entry.bridgeId),
  )
}

/** Chat notices (recommended, closable) for the Bridges `missingBridges` finds. */
export function missingBridgeNotices(
  table: KnownBridgesTable,
  enabledIds: readonly string[],
) {
  return missingBridges(table, enabledIds).map((bridge) => ({
    key: `bridge|${bridge.bridgeId}`,
    kind: 'bridge' as const,
    severity: 'recommended' as const,
    pluginId: bridge.bridgeId,
    name: bridge.name,
    messageKey: bridge.messageKey,
  }))
}

/**
 * A Bridge that is enabled while a stored declarative connector targets the
 * same plugin. Wording only: both keep working and nothing here gates a tool.
 */
export function bridgeConnectorNotices(
  table: KnownBridgesTable,
  enabledIds: readonly string[],
  connectors: readonly { id: string; target: { pluginId: string } }[],
) {
  const enabled = new Set(enabledIds)
  return table.entries
    .filter((entry) => enabled.has(entry.bridgeId))
    .flatMap((bridge) =>
      connectors
        .filter(
          (connector) => connector.target.pluginId === bridge.targetPluginId,
        )
        .map((connector) => ({
          key: `bridge-connector|${bridge.bridgeId}|${connector.id}`,
          kind: 'bridge' as const,
          severity: 'recommended' as const,
          pluginId: bridge.bridgeId,
          name: bridge.name,
          messageKey: 'ui.Compatibility.bridgeConnector',
          connectorId: connector.id,
        })),
    )
}

/** Every Bridge notice: install hints, then duplicate-connector hints. */
export function bridgeNotices(
  table: KnownBridgesTable,
  enabledIds: readonly string[],
  connectors: readonly { id: string; target: { pluginId: string } }[],
) {
  return [
    ...missingBridgeNotices(table, enabledIds),
    ...bridgeConnectorNotices(table, enabledIds, connectors),
  ]
}

/** The Bridge that took over a removed built-in tool name, if any. */
export function bridgeForRetiredTool(
  name: string,
  table: KnownBridgesTable = activeKnownBridges(),
): KnownBridge | undefined {
  return table.entries.find((entry) => entry.retiredTools.includes(name))
}

/** Model-facing refusal for a call to a tool name that moved into a Bridge. */
export function retiredToolFact(name: string, bridge: KnownBridge): string {
  return L({
    ko: `\`${name}\`는 Verbex에서 빠졌고 ${bridge.name}가 제공합니다. Bridge가 승인돼 있으면 그 도구를 쓰고, 없으면 사람에게 설치를 안내하세요.`,
    en: `\`${name}\` was removed from Verbex and is provided by ${bridge.name}. If the Bridge is approved, use its tools; otherwise tell the user to install it.`,
  })
}
