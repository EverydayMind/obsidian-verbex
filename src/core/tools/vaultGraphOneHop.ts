import type { App, TFile } from 'obsidian'

import { L } from '../../i18n/modelText'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import { stringifyUnknown } from '../../utils/stringifyUnknown'
import {
  type LinkRef,
  type ResolvedLinks,
  markdownLinkRefs,
  unresolvedFor,
} from '../../utils/vault-relations'

type Direction = 'in' | 'out'

function groupValue(value: unknown): string {
  if (value == null) return ''
  const text = stringifyUnknown(value).trim()
  const link = /^\[\[([^\]]+)\]\]$/.exec(text)
  if (!link) return text.replace(/\s+/g, ' ')
  const [path, alias] = link[1].split('|')
  const basename = path.split('#')[0].split('/').pop()?.replace(/\.md$/i, '')
  return (alias?.trim() || (basename ?? link[1])).replace(/\s+/g, ' ').trim()
}

function groupLine(
  app: App,
  markdown: ReadonlyMap<string, TFile>,
  refs: LinkRef[],
  field: string,
  directionLabel: string,
): string {
  const missing = L({ ko: '값 없음', en: 'No value' })
  const hidden = L({ ko: '(비공개)', en: '(private)' })
  const groups = new Map<string, number>()
  let listValues = false
  for (const { path } of refs) {
    if (isAiPrivatePath(path)) {
      groups.set(hidden, (groups.get(hidden) ?? 0) + 1)
      continue
    }
    const file = markdown.get(path)
    const frontmatter =
      file && app.metadataCache?.getFileCache?.(file)?.frontmatter
    const value: unknown =
      frontmatter && Object.hasOwn(frontmatter, field)
        ? frontmatter[field]
        : undefined
    if (Array.isArray(value)) listValues = true
    const values = (Array.isArray(value) ? value : [value])
      .map(groupValue)
      .filter(Boolean)
    // A note contributes once per displayed value, even if its property repeats it.
    for (const label of new Set(values.length ? values : [missing]))
      groups.set(label, (groups.get(label) ?? 0) + 1)
  }
  const distribution =
    [...groups]
      .sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b))
      .map(([label, count]) => `${label} ${count}`)
      .join(', ') || L({ ko: '이웃 없음', en: 'No neighbors' })
  return L({
    ko: `${field}별(${directionLabel} 노트 ${refs.length}개 기준): ${distribution}${listValues ? ' · 목록 값은 값마다 셈' : ''}`,
    en: `By ${field} (${directionLabel.toLowerCase()}, ${refs.length} notes): ${distribution}${listValues ? ' · Each list value counted separately' : ''}`,
  })
}

export function vaultGraphOneHop(
  app: App,
  markdown: ReadonlyMap<string, TFile>,
  source: string,
  direction: Direction | 'both',
  limit: number,
  includeUnresolved: boolean,
  groupBy: string,
): string {
  const resolved = app.metadataCache?.resolvedLinks ?? {}
  const unresolved: ResolvedLinks = app.metadataCache?.unresolvedLinks ?? {}
  const totals: string[] = []
  const groups: string[] = []
  const edges: string[] = []
  let totalEdges = 0
  const pushEdge = (line: string) => {
    totalEdges++
    if (edges.length < limit) edges.push(line)
  }
  const directions: Direction[] =
    direction === 'both' ? ['out', 'in'] : [direction]
  for (const hop of directions) {
    const refs = markdownLinkRefs(resolved, source, markdown, hop)
    const label =
      hop === 'in'
        ? L({ ko: '들어오는 링크', en: 'Incoming links' })
        : L({ ko: '나가는 링크', en: 'Outgoing links' })
    const count = refs.reduce((sum, ref) => sum + ref.count, 0)
    totals.push(
      L({
        ko: `${label}: 노트 ${refs.length}개, 링크 ${count}회`,
        en: `${label}: ${refs.length} ${refs.length === 1 ? 'note' : 'notes'}, ${count} ${count === 1 ? 'occurrence' : 'occurrences'}`,
      }),
    )
    if (groupBy) groups.push(groupLine(app, markdown, refs, groupBy, label))
    for (const { path, count } of refs)
      pushEdge(
        hop === 'in'
          ? `${path} -> ${source}\tcount=${count}\t(backlink)`
          : `${source} -> ${path}\tcount=${count}`,
      )
  }
  if (includeUnresolved)
    for (const { path, count } of unresolvedFor(unresolved, source))
      pushEdge(`${source} -> ${path}\tcount=${count}\t(unresolved)`)
  if (totalEdges > edges.length)
    edges.push(`... omitted ${totalEdges - edges.length} edge(s)`)
  if (!edges.length) edges.push('(no links)')
  return [...totals, ...groups, ...edges].join('\n')
}
