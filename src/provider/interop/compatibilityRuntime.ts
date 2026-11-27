import type { App } from 'obsidian'

import { L } from '../../i18n/modelText'

import {
  type CompatibilityFinding,
  type CompatibilityTable,
  type TableParse,
  evaluateCompatibility,
  parseCompatibilityTable,
} from './compatibility'
import bundled from './compatibility.json'
import { listEnabledPluginInstances } from './discovery'
import { readManifestName } from './pendingPluginApprovals'

let override: unknown
let overridden = false
let issue: string | undefined
let reported: string | undefined
let memo: { raw: unknown; parsed: TableParse } | undefined

/** Tests and diagnostics only: replace (or with no argument, restore) the table. */
export function overrideCompatibilityTable(...raw: [] | [unknown]): void {
  overridden = raw.length > 0
  override = raw[0]
  reported = undefined
}

/** Why the last table read was ignored, or undefined when it was usable. */
export function compatibilityTableIssue(): string | undefined {
  return issue
}

const EMPTY: CompatibilityTable = { entries: [] }

/** A defective table is ignored whole (no notice, no blocking) and recorded. */
export function activeCompatibilityTable(): CompatibilityTable {
  const raw = overridden ? override : bundled
  const current: { raw: unknown; parsed: TableParse } =
    memo && memo.raw === raw
      ? memo
      : { raw, parsed: parseCompatibilityTable(raw) }
  memo = current
  const parsed: TableParse = current.parsed
  issue = parsed.ok ? undefined : parsed.reason
  if (!parsed.ok && reported !== parsed.reason) {
    reported = parsed.reason
    console.warn(`Verbex compatibility table ignored: ${parsed.reason}`)
  }
  return parsed.ok ? parsed.table : EMPTY
}

export function compatibilityFindings(app: App): CompatibilityFinding[] {
  const table = activeCompatibilityTable()
  if (table.entries.length === 0) return []
  return evaluateCompatibility(table, listEnabledPluginInstances(app))
}

export function compatibilityPluginName(app: App, id: string): string {
  const raw = readManifestName(app, id) ?? id
  const clean = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, 60)
  return clean || id
}

/** Stated as a fact so the model can pass it to the user as it is. */
export function updateRequiredFact(
  name: string,
  required: string,
  installed: string,
): string {
  return L({
    ko: `${name} ${required} 이상이 필요합니다(현재 ${installed}). 설정 → 커뮤니티 플러그인 → 업데이트 확인에서 사용자가 업데이트해야 합니다.`,
    en: `${name} ${required} or later is required (installed: ${installed}). Only the user can update it, in Settings > Community plugins > Check for updates.`,
  })
}

function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  return (/\.[^.]*$/.exec(name)?.[0] ?? '').toLowerCase()
}

/**
 * A required ownership entry unmet by an enabled plugin makes the companion
 * answer unverifiable. With a target path only entries listing its extension
 * count; without one every unmet entry counts (conservative).
 */
export function ownershipCompatibilityError(
  app: App,
  targetPath?: string,
): Error | undefined {
  const extension = targetPath ? extensionOf(targetPath) : undefined
  const unmet = compatibilityFindings(app).filter(
    (finding) =>
      finding.feature === 'ownership' &&
      finding.severity === 'required' &&
      (extension === undefined || !!finding.extensions?.includes(extension)),
  )
  if (unmet.length === 0) return undefined
  const facts = unmet.map((finding) =>
    updateRequiredFact(
      compatibilityPluginName(app, finding.pluginId),
      finding.required,
      finding.installed,
    ),
  )
  return new Error(
    `${L({
      ko: '동반 편집 문서의 소유권을 확인할 수 없어 쓰기를 거절했습니다.',
      en: 'Writing was refused because ownership of companion-editor documents cannot be verified.',
    })} ${facts.join(' ')}`,
  )
}

/** Source for the companion-ownership union: it only ever rejects or adds nothing. */
export function compatibilityOwnershipSource(
  app: App,
): (targetPath?: string) => Promise<string[]> {
  return (targetPath) => {
    const error = ownershipCompatibilityError(app, targetPath)
    return error ? Promise.reject(error) : Promise.resolve([])
  }
}

/** A privacy entry that is unmet for this plugin and extension, with its fact. */
export function privacyCompatibilityBlock(
  app: App,
  plugin: { id: string },
  extension: string,
): { updateNote: string } | undefined {
  const hit = compatibilityFindings(app).find(
    (finding) =>
      finding.pluginId === plugin.id &&
      finding.feature === 'privacy' &&
      finding.severity === 'required' &&
      finding.extensions?.includes(extension),
  )
  return hit
    ? {
        updateNote: updateRequiredFact(
          compatibilityPluginName(app, plugin.id),
          hit.required,
          hit.installed,
        ),
      }
    : undefined
}
