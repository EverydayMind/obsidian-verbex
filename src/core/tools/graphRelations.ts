import { ResolvedLinks } from '../../utils/vault-relations'

export type GraphStats = {
  orphans: string[]
  most_linked: { path: string; in: number; out: number }[]
  tag_cooccurrence: { tags: string[]; count: number }[]
  totals: {
    nodes: number
    edges: number
    unique_edges: number
    orphans: number
    tags: number
    tag_pairs: number
  }
  truncated: boolean
}

const MAX_ORPHANS = 200
const MAX_TAGS_PER_NOTE = 100
const MAX_TAG_PAIRS = 50_000
const MAX_RESULT_CHARS = 40_000

/** Build bounded, factual graph statistics from already collected vault facts. */
export function buildGraphStats(
  paths: string[],
  resolvedLinks: ResolvedLinks,
  tagsByPath: ReadonlyMap<string, string[]>,
  top: number,
): GraphStats {
  const nodes = new Set(paths)
  const degree = new Map<string, { in: number; out: number }>()
  paths.forEach((path) => degree.set(path, { in: 0, out: 0 }))
  let edgeCount = 0
  let uniqueEdgeCount = 0
  for (const [source, targets] of Object.entries(resolvedLinks)) {
    if (!nodes.has(source)) continue
    for (const [target, count] of Object.entries(targets)) {
      if (!nodes.has(target)) continue
      const weight = typeof count === 'number' && count > 0 ? count : 1
      const sourceDegree = degree.get(source)
      const targetDegree = degree.get(target)
      if (!sourceDegree || !targetDegree) continue
      sourceDegree.out += weight
      targetDegree.in += weight
      edgeCount += weight
      uniqueEdgeCount += 1
    }
  }

  const orphanCandidates = paths
    .filter((path) => {
      const item = degree.get(path)
      if (!item) return false
      return item.in === 0 && item.out === 0
    })
    .sort()
  const mostLinked = [...degree.entries()]
    .sort(
      ([pathA, a], [pathB, b]) =>
        b.in + b.out - (a.in + a.out) || pathA.localeCompare(pathB),
    )
    .slice(0, top)
    .map(([path, item]) => ({ path, in: item.in, out: item.out }))

  const tagPairs = new Map<string, number>()
  const allTags = new Set<string>()
  let truncated = orphanCandidates.length > MAX_ORPHANS
  for (const path of paths) {
    const tags = [...(tagsByPath.get(path) ?? [])]
    tags.forEach((tag) => allTags.add(tag))
    if (tags.length > MAX_TAGS_PER_NOTE) {
      truncated = true
      tags.splice(MAX_TAGS_PER_NOTE)
    }
    for (let i = 0; i < tags.length; i += 1) {
      for (let j = i + 1; j < tags.length; j += 1) {
        const key = `${tags[i]}\u0000${tags[j]}`
        if (tagPairs.size >= MAX_TAG_PAIRS && !tagPairs.has(key)) {
          truncated = true
          continue
        }
        tagPairs.set(key, (tagPairs.get(key) ?? 0) + 1)
      }
    }
  }
  const tagCooccurrence = [...tagPairs.entries()]
    .sort(([aKey, a], [bKey, b]) => b - a || aKey.localeCompare(bKey))
    .slice(0, top)
    .map(([key, count]) => ({ tags: key.split('\u0000'), count }))
  const payload: GraphStats = {
    orphans: orphanCandidates.slice(0, MAX_ORPHANS),
    most_linked: mostLinked,
    tag_cooccurrence: tagCooccurrence,
    totals: {
      nodes: nodes.size,
      edges: edgeCount,
      unique_edges: uniqueEdgeCount,
      orphans: orphanCandidates.length,
      tags: allTags.size,
      tag_pairs: tagPairs.size,
    },
    truncated,
  }
  while (JSON.stringify(payload).length > MAX_RESULT_CHARS) {
    if (payload.orphans.length > 0) payload.orphans.pop()
    else if (payload.most_linked.length > 0) payload.most_linked.pop()
    else if (payload.tag_cooccurrence.length > 0) payload.tag_cooccurrence.pop()
    else break
    payload.truncated = true
  }
  return payload
}
