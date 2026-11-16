import type { NativeExposureTrace } from './exposureGates'
import {
  type ExposureProviderSummary,
  boundedProviderSummaries,
} from './exposureProviderSummary'
import type { NativeToolEntry } from './NativeProviderHost'
import type { NativeTurnScope, ScopeCaptureStatus } from './turnScope'

export const EXPOSURE_DIAGNOSTIC_BYTES = 64 * 1024
export const EXPOSURE_ALIAS_LIMIT = 4096
const NAME_LIMIT = 40
const REASONS = [
  'not_ready',
  'tool_disabled',
  'effect_hidden',
  'unknown',
  'excluded',
  'exposed',
  'budget',
  'budget_blocked',
  'not_selected',
] as const
const validName = (name: string) => /^[A-Za-z0-9_.:-]{1,100}$/.test(name)
export function diagnosticJsonBytes(value: unknown): number {
  const text = JSON.stringify(value)
  let total = 0
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    total += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return total
}
const validDetail = new Set([
  'pending',
  'reapproval',
  'disabled',
  'error',
  'session',
  'commit',
  'browser',
])

export type ExposureSubmissionFact = {
  runId: string
  conversationId?: string
  currentPath?: string
  scope?: NativeTurnScope
  scopeStatus?: ScopeCaptureStatus
  requested: readonly string[]
  entries: readonly NativeToolEntry[]
  providers?: readonly ExposureProviderSummary[]
  exposedNames: readonly string[]
  tokens: number
  omitted: number
  trace: NativeExposureTrace
}
export type ExposureWireFact = {
  runId: string
  sequence: number
  names?: readonly string[]
  listHash?: string
  hashUnavailable?: boolean
}
type AliasLink = { alias: string; linked?: string; extension?: string }

/** Separate aliases and byte-bounded records, with no prompt, path or session text. */
export class ExposureDiagnosticBuffer {
  private readonly aliases = new Map<string, string>()
  private nextAlias = 0
  private dropped = 0
  private readonly records: object[] = []
  constructor(
    private readonly lookup: (
      field: string,
      value: string,
    ) => string | undefined,
  ) {}

  private alias(field: string, raw: string): AliasLink {
    const value =
      field === 'path'
        ? raw
            .replace(/\\/g, '/')
            .replace(/\/+/g, '/')
            .replace(/^(?:\.\/)+/, '')
        : raw
    const key = `${field}:${value}`
    let alias = this.aliases.get(key)
    if (!alias) {
      if (this.aliases.size >= EXPOSURE_ALIAS_LIMIT)
        this.aliases.delete(this.aliases.keys().next().value as string)
      alias = `xref-${++this.nextAlias}`
      this.aliases.set(key, alias)
    }
    const linked = this.lookup(field, value)
    const extension =
      field === 'path'
        ? value.match(/(\.[A-Za-z0-9]{1,12})$/)?.[1]?.toLowerCase()
        : undefined
    return {
      alias,
      ...(linked ? { linked } : {}),
      ...(extension ? { extension } : {}),
    }
  }

  record(fact: ExposureSubmissionFact): void {
    const candidates = new Set(
      fact.trace.demotions.map((item) => item.providerId).filter(validName),
    )
    const wanted = new Set(fact.requested.filter(validName))
    const candidateNames = new Set(
      fact.entries
        .filter((entry) => candidates.has(entry.providerId))
        .map((entry) => entry.name),
    )
    const include = (name: string) =>
      validName(name) &&
      (candidateNames.has(name) ||
        wanted.has(name) ||
        [...candidates].some((id) => name.startsWith(`plg__${id}__`)))
    const gateNames = new Set(fact.trace.gates.map((item) => item.name))
    const allReasons = [
      ...fact.trace.gates.map((item) => ({
        name: item.name,
        reason: item.reason,
        ...(item.detail && validDetail.has(item.detail)
          ? { detail: item.detail }
          : {}),
      })),
      ...fact.trace.availableReasons
        .filter((item) => !gateNames.has(item.name))
        .map((item) => ({
          name: item.name,
          reason: item.reason,
          ...(item.reason === 'budget_blocked' &&
          validName(item.blockedBy.providerId)
            ? { blockedBy: item.blockedBy.providerId }
            : {}),
        })),
    ].filter((item) => REASONS.some((reason) => reason === item.reason))
    const reasons = allReasons
      .filter((item) => include(item.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    const otherReasonCounts = Object.fromEntries(
      REASONS.map((reason) => [
        reason,
        allReasons.filter(
          (item) => !include(item.name) && item.reason === reason,
        ).length,
      ]),
    )
    const names = fact.exposedNames
      .filter(validName)
      .sort((a, b) => a.localeCompare(b, 'en'))
    const recordedNames = new Set(
      [...new Set([...names, ...reasons.map((item) => item.name)])].slice(
        0,
        NAME_LIMIT,
      ),
    )
    const visibleNames = names.filter((name) => recordedNames.has(name))
    const visibleReasons = reasons.filter((item) =>
      recordedNames.has(item.name),
    )
    const demotions = fact.trace.demotions
      .filter((item) => validName(item.providerId))
      .map((item) => ({
        providerId: item.providerId,
        demoted: item.demoted,
        reason: ['demoted', 'state', 'request_or_history'].includes(item.reason)
          ? item.reason
          : 'state',
      }))
    const number = (value: number) =>
      Number.isFinite(value)
        ? Math.max(0, Math.min(1_000_000_000, Math.floor(value)))
        : 0
    const record = {
      kind: 'submission',
      ...boundedProviderSummaries(fact.providers ?? []),
      run: this.alias('runId', fact.runId),
      ...(fact.conversationId
        ? { conversation: this.alias('conversationId', fact.conversationId) }
        : {}),
      ...(fact.currentPath
        ? { activeFile: this.alias('path', fact.currentPath) }
        : {}),
      ...(fact.scope
        ? {
            scope: {
              providerId: validName(fact.scope.providerId)
                ? fact.scope.providerId
                : 'redacted',
              path: this.alias('path', fact.scope.scope.path),
              session: this.alias('sessionId', fact.scope.scope.sessionId),
              revision: number(fact.scope.scope.revision),
            },
          }
        : {}),
      ...(fact.scopeStatus ? { scopeStatus: fact.scopeStatus } : {}),
      exposedNames: visibleNames,
      exposedOverflow: names.length - visibleNames.length,
      reasons: visibleReasons,
      reasonOverflow: reasons.length - visibleReasons.length,
      otherReasonCounts,
      demotions: demotions.slice(0, 32),
      demotionOverflow: Math.max(0, demotions.length - 32),
      tokens: number(fact.tokens),
      omitted: number(fact.omitted),
      gateCollectionFailed: fact.trace.gateCollectionFailed,
    }
    this.append(record)
  }

  recordWire(fact: ExposureWireFact): void {
    const names = fact.names?.filter(validName)
    this.append({
      kind: 'wire',
      run: this.alias('runId', fact.runId),
      sequence:
        Number.isSafeInteger(fact.sequence) && fact.sequence > 0
          ? fact.sequence
          : 0,
      attached: fact.names !== undefined,
      ...(names
        ? {
            names: names.slice(0, NAME_LIMIT),
            namesOverflow:
              (fact.names?.length ?? 0) - names.slice(0, NAME_LIMIT).length,
          }
        : {}),
      ...(fact.listHash && /^[0-9a-f]{64}$/.test(fact.listHash)
        ? { listHash: fact.listHash }
        : {}),
      ...(fact.hashUnavailable ? { hashUnavailable: true } : {}),
    })
  }

  private append(record: object): void {
    this.records.push(record)
    while (
      diagnosticJsonBytes(this.snapshot(Infinity)) >
        EXPOSURE_DIAGNOSTIC_BYTES &&
      this.records.length
    ) {
      this.records.shift()
      this.dropped++
    }
  }

  snapshot(maxBytes = EXPOSURE_DIAGNOSTIC_BYTES) {
    const records = this.records.map(
      (item) => JSON.parse(JSON.stringify(item)) as object,
    )
    let dropped = this.dropped
    const aliasEvictions = Math.max(0, this.nextAlias - EXPOSURE_ALIAS_LIMIT)
    while (
      records.length &&
      diagnosticJsonBytes({ records, dropped, aliasEvictions }) > maxBytes
    ) {
      records.shift()
      dropped++
    }
    return { records, dropped, aliasEvictions }
  }
}
