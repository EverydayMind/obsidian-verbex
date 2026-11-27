import {
  type BasesEntry,
  type BasesPropertyId,
  type BasesQueryResult,
  BasesView,
  type BasesViewConfig,
  type QueryController,
} from 'obsidian'

import { t } from '../../i18n'

import type { EvaluatedProperty } from './basesEngineResult'

export const VERBEX_BASES_VIEW_TYPE = 'verbex-reader'

export type RawEvaluatedEntry = {
  path: string
  values: string[]
}

export type RawEvaluatedGroup = {
  key: string | null
  entries: RawEvaluatedEntry[]
}

export type RawViewSnapshot = {
  properties: EvaluatedProperty[]
  entries: RawEvaluatedEntry[]
  groups: RawEvaluatedGroup[]
  hasGroupByHint: boolean
}

export type PendingBasesRequest = {
  settled: boolean
  /** Set when Bases created a Verbex view inside this request's element. */
  viewCreated?: boolean
  resolve: (snapshot: RawViewSnapshot) => void
}

function safeValueString(value: unknown): string {
  if (value == null) return ''
  try {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value)
    if (
      typeof value === 'object' &&
      'isTruthy' in value &&
      typeof (value as { toString?: () => string }).toString === 'function'
    ) {
      const text = (value as { toString: () => string }).toString()
      return text === 'null' ? '' : text
    }
    const toText = (value as { toString?: unknown }).toString
    return typeof toText === 'function' ? String(toText.call(value)) : ''
  } catch {
    return ''
  }
}

function readEntryValues(
  entry: BasesEntry,
  propIds: readonly BasesPropertyId[],
): string[] {
  return propIds.map((prop) => {
    try {
      const value = entry.getValue(prop)
      return safeValueString(value)
    } catch {
      return ''
    }
  })
}

function readDisplayName(
  config: BasesViewConfig | undefined,
  prop: BasesPropertyId,
): string {
  try {
    const name = config?.getDisplayName?.(prop)
    return typeof name === 'string' && name.length > 0 ? name : prop
  } catch {
    return prop
  }
}

export function extractViewSnapshot(
  data: BasesQueryResult,
  config?: BasesViewConfig,
): RawViewSnapshot {
  const rawProps = Array.isArray(data?.properties) ? data.properties : []
  const propIds: BasesPropertyId[] =
    rawProps.length > 0 ? [...rawProps] : (['file.name'] as BasesPropertyId[])
  const properties: EvaluatedProperty[] = propIds.map((id) => ({
    id,
    displayName: readDisplayName(config, id),
  }))

  const toEntry = (entry: BasesEntry): RawEvaluatedEntry => ({
    path: entry.file.path,
    values: readEntryValues(entry, propIds),
  })

  const entries = (Array.isArray(data?.data) ? data.data : []).map(toEntry)
  const rawGroups = Array.isArray(data?.groupedData) ? data.groupedData : []
  const groups: RawEvaluatedGroup[] = rawGroups.map((group) => {
    let key: string | null = null
    try {
      const hasKey =
        typeof group.hasKey === 'function' ? group.hasKey() : group.key != null
      if (hasKey && group.key != null) {
        const text = safeValueString(group.key)
        key = text.length > 0 ? text : null
      }
    } catch {
      key = null
    }
    return {
      key,
      entries: (Array.isArray(group.entries) ? group.entries : []).map(toEntry),
    }
  })
  const hasGroupByHint =
    groups.length > 1 || (groups.length === 1 && groups[0].key !== null)

  return { properties, entries, groups, hasGroupByHint }
}

function renderFallbackNotice(
  containerEl: HTMLElement,
  rowCount: number,
): void {
  const notice = t('ui.basesReader.notice')
  const rows = t('ui.basesReader.rowCount', { count: rowCount })
  const withObsidianHelpers = containerEl as HTMLElement & {
    empty?: () => void
    createEl?: (
      tag: string,
      opts?: { text?: string; cls?: string },
    ) => HTMLElement
  }
  if (typeof withObsidianHelpers.empty === 'function') {
    withObsidianHelpers.empty()
  } else {
    containerEl.textContent = ''
  }
  if (typeof withObsidianHelpers.createEl === 'function') {
    withObsidianHelpers.createEl('p', { text: notice })
    withObsidianHelpers.createEl('p', { text: rows })
    return
  }
  if (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'
  ) {
    const p1 = document.createElement('p')
    p1.textContent = notice
    const p2 = document.createElement('p')
    p2.textContent = rows
    containerEl.appendChild(p1)
    containerEl.appendChild(p2)
    return
  }
  containerEl.textContent = `${notice}\n${rows}`
}

export class VerbexBasesReaderView extends BasesView {
  type = VERBEX_BASES_VIEW_TYPE
  private pendingRequest: PendingBasesRequest | null = null
  private boundInternal = false

  constructor(
    controller: QueryController,
    private readonly containerEl: HTMLElement,
    private readonly findPending: (
      el: HTMLElement,
    ) => PendingBasesRequest | null,
  ) {
    super(controller)
    const hit = this.findPending(containerEl)
    if (hit) {
      this.pendingRequest = hit
      this.boundInternal = true
    }
  }

  onDataUpdated(): void {
    if (!this.boundInternal) {
      const hit = this.findPending(this.containerEl)
      if (hit) {
        this.pendingRequest = hit
        this.boundInternal = true
      }
    }
    if (this.boundInternal) {
      if (!this.pendingRequest || this.pendingRequest.settled) return
      this.pendingRequest.settled = true
      this.pendingRequest.resolve(extractViewSnapshot(this.data, this.config))
      return
    }
    renderFallbackNotice(this.containerEl, this.data?.data?.length ?? 0)
  }
}
