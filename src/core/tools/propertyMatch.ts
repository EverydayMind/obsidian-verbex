import type { App, TFile } from 'obsidian'

import { L } from '../../i18n/modelText'
import { propertyValueMatches } from '../../utils/propertyLinks'

import { ToolArgs, str } from './localToolCommon'

export function pageNumber(
  value: unknown,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.floor(value)))
    : fallback
}

const strings = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter((v): v is string => typeof v === 'string' && !!v.trim()),
        ),
      ].slice(0, max)
    : []

export const fmKey = (fm: Record<string, unknown>, name: string) =>
  Object.keys(fm).find((key) => key.toLowerCase() === name.toLowerCase())

export const fmValue = (fm: Record<string, unknown>, name: string) => {
  const key = fmKey(fm, name)
  return key === undefined ? undefined : fm[key]
}

export const show = (v: unknown): string => JSON.stringify(v) ?? 'null'

export type PropertyQuerySpec = {
  prop: string
  value: string
  limit: number
  offset?: number
  filterField: string | null
  include: string[]
  exclude: string[]
  fields: string[]
}

export type PropertyMatch = {
  file: TFile
  fm: Record<string, unknown>
  actual: unknown
}

export function parsePropertyQuery(
  args: ToolArgs,
): PropertyQuerySpec | { error: string } {
  const prop = str(args, 'key') ?? str(args, 'property')
  const value = str(args, 'value')
  if (!prop || !value)
    return { error: 'find_by_property requires "key" and "value".' }
  const filterField = str(args, 'filter_field')
  const exclude = strings(args.exclude_values, 50)
  const include = strings(args.include_values, 50)
  if ((exclude.length || include.length) && !filterField)
    return {
      error:
        'find_by_property: exclude_values/include_values require "filter_field".',
    }
  return {
    prop,
    value,
    limit: Math.max(1, pageNumber(args.limit, 100, 500)),
    offset:
      typeof args.offset === 'number' ? pageNumber(args.offset, 0) : undefined,
    filterField,
    include,
    exclude,
    fields: [
      ...new Set([
        ...strings(args.fields, 8),
        ...(filterField ? [filterField] : []),
      ]),
    ].slice(0, 8),
  }
}

/** `matched` satisfies key=value; `matches` also passes the host filter. */
export function matchProperty(spec: PropertyQuerySpec, app: App) {
  const matched = app.vault
    .getMarkdownFiles()
    .flatMap((file) => {
      const fm = (app.metadataCache.getFileCache(file)?.frontmatter ??
        {}) as Record<string, unknown>
      const key = fmKey(fm, spec.prop)
      return key && propertyValueMatches(fm[key], spec.value, app, file.path)
        ? [{ file, fm, actual: fm[key] }]
        : []
    })
    .sort((a, b) => a.file.path.localeCompare(b.file.path))
  // Host-side filter on actual frontmatter values: missing values are never
  // excluded by exclude_values, so unclassified notes stay visible.
  const { filterField, include, exclude } = spec
  const matches: PropertyMatch[] = filterField
    ? matched.filter(({ file, fm }) => {
        const actual = fmValue(fm, filterField)
        const hit = (list: string[]) =>
          list.some((v) => propertyValueMatches(actual, v, app, file.path))
        return (!include.length || hit(include)) && !hit(exclude)
      })
    : matched
  return { matched, matches }
}

/** Value counts over the whole match set, so excluding values needs no paging. */
export function distribution(
  matches: { fm: Record<string, unknown> }[],
  field: string,
): string {
  const counts = new Map<string, number>()
  for (const { fm } of matches) {
    const raw = fmValue(fm, field)
    const values =
      raw === undefined || raw === null || raw === ''
        ? [L({ ko: '(없음)', en: '(none)' })]
        : (Array.isArray(raw) ? raw : [raw]).map(show)
    for (const v of new Set(values)) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1])
  const shown = sorted.slice(0, 30).map(([v, n]) => `${v} ${n}`)
  const rest = sorted.length - shown.length
  return L({
    ko: `분포 ${field}(조건 일치 ${matches.length}개 전체): ${shown.join(', ')}${rest > 0 ? `, 외 ${rest}종` : ''}`,
    en: `Distribution of ${field} (all ${matches.length} condition matches): ${shown.join(', ')}${rest > 0 ? `, ${rest} other values` : ''}`,
  })
}

export function filterLine(
  spec: PropertyQuerySpec,
  matches: number,
  matched: number,
): string {
  const { filterField, include, exclude } = spec
  return filterField
    ? L({
        ko: `\n필터 ${filterField}: ${include.length ? `포함 ${show(include)} ` : ''}${exclude.length ? `제외 ${show(exclude)} ` : ''}→ ${matches}/${matched}개 (값 없음은 제외되지 않음)`,
        en: `\nFilter ${filterField}: ${include.length ? `include ${show(include)} ` : ''}${exclude.length ? `exclude ${show(exclude)} ` : ''}→ ${matches}/${matched} (missing values are not excluded)`,
      })
    : ''
}
