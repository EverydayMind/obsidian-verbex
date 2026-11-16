import { isAlias, isMap, isScalar, parseDocument, visit } from 'yaml'

import { dataEqual as isEqual } from '../../utils/dataEqual'

export type BindingValues = { 'hwpx-dialect': string; 'hwpx-template': string }
const keys = ['hwpx-dialect', 'hwpx-template'] as const
export const bindingLines = (values: BindingValues) =>
  keys.map((key) => `${key}: ${JSON.stringify(values[key])}`)

/** Conservative subset of gray-matter's frontmatter location semantics. */
export function locateDraftFrontmatter(text: string) {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : ''
  const source = text.slice(bom.length)
  const eol = source.match(/\r?\n/)?.[0] ?? '\n'
  if (!source.startsWith('---') || source.startsWith('----'))
    return { state: 'absent' as const, bom, eol, body: source }
  const open = /^---\r?\n/.exec(source)
  const close = /\n---/.exec(source)
  if (!open || !close) return { state: 'unsupported' as const }
  const end = close.index + 4
  const ending = /^(?:\r?\n|$)/.exec(source.slice(end))
  if (!ending) return { state: 'unsupported' as const }
  const yaml = source.slice(open[0].length, close.index + 1)
  if (/^\.\.\.\s*$/m.test(yaml)) return { state: 'unsupported' as const }
  try {
    const doc = parseDocument(yaml)
    let alias = false
    visit(doc, {
      Alias: () => {
        alias = true
      },
    })
    if (
      doc.errors.length ||
      doc.warnings.length ||
      alias ||
      !isMap(doc.contents) ||
      doc.contents.flow
    )
      return { state: 'unsupported' as const }
    const values = doc.toJS({ maxAliasCount: 0 }) as Record<string, unknown>
    return {
      state: 'simple' as const,
      bom,
      eol,
      yaml,
      doc,
      values,
      body: source.slice(end),
      closing: source.slice(end, end + ending[0].length),
    }
  } catch {
    return { state: 'unsupported' as const }
  }
}

/** Only the two host-owned scalar lines may change; all other values and body survive. */
export function bindDraftFrontmatter(
  text: string,
  values: BindingValues,
): {
  text: string
  state: 'inserted' | 'updated' | 'unchanged' | 'unsupported'
  reason?: string
} {
  const unsupported = () => ({
    text,
    state: 'unsupported' as const,
    reason: 'frontmatter_unsupported',
  })
  const found = locateDraftFrontmatter(text)
  if (found.state === 'unsupported') return unsupported()
  const lines = bindingLines(values).join(found.eol)
  if (found.state === 'absent') {
    const result = `${found.bom}---${found.eol}${lines}${found.eol}---${found.eol}${found.eol}${found.body}`
    const check = locateDraftFrontmatter(result)
    return check.state === 'simple' &&
      keys.every((key) => check.values[key] === values[key])
      ? { text: result, state: 'inserted' }
      : unsupported()
  }
  const ranges: [number, number][] = []
  for (const pair of isMap(found.doc.contents)
    ? found.doc.contents.items
    : []) {
    if (
      !isScalar(pair.key) ||
      !keys.includes(pair.key.value as (typeof keys)[number])
    )
      continue
    const value = pair.value
    if (
      !isScalar(value) ||
      isAlias(value) ||
      !value.range ||
      !pair.key.range ||
      !['PLAIN', 'QUOTE_DOUBLE', 'QUOTE_SINGLE'].includes(value.type ?? '') ||
      /[\r\n]/.test(found.yaml.slice(pair.key.range[0], value.range[1]))
    )
      return unsupported()
    const start = found.yaml.lastIndexOf('\n', pair.key.range[0] - 1) + 1
    const newline = found.yaml.indexOf('\n', value.range[1])
    ranges.push([start, newline < 0 ? found.yaml.length : newline + 1])
  }
  if (keys.every((key) => found.values[key] === values[key]))
    return { text, state: 'unchanged' }
  let yaml = found.yaml
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0]))
    yaml = yaml.slice(0, start) + yaml.slice(end)
  const result = `${found.bom}---${found.eol}${lines}${found.eol}${yaml}---${found.body}`
  const check = locateDraftFrontmatter(result)
  const others = (record: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(record).filter(
        ([key]) => !keys.includes(key as (typeof keys)[number]),
      ),
    )
  if (
    check.state !== 'simple' ||
    check.body !== found.body ||
    check.bom !== found.bom ||
    check.eol !== found.eol ||
    !keys.every((key) => check.values[key] === values[key]) ||
    !isEqual(others(check.values), others(found.values))
  )
    return unsupported()
  return { text: result, state: 'updated' }
}
