import type { SemanticReplay } from './semanticReplay'

export const SEMANTIC_STATS_VERSION = 'observed-structure/0.2'
export type StatsNode = {
  ref: string
  container: string
  role: string | null
  semanticParentRef: string | null
  provenance: 'model' | 'user' | 'rule' | 'unresolved'
  facts: string[]
}

const increment = (map: Map<string, number>, key: string) =>
  map.set(key, (map.get(key) ?? 0) + 1)
const counts = (map: Map<string, number>) =>
  Object.fromEntries([...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
const median = (values: number[]) => {
  const middle = Math.floor(values.length / 2)
  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2
}
const nearest = (values: number[], percentile: number) =>
  values[Math.max(0, Math.ceil(values.length * percentile) - 1)]

/** Recomputed from the effective tree and fixed features; never includes source text. */
export function summarizeSemanticStructure(
  nodes: readonly StatsNode[],
  evidence: SemanticReplay['evidence'],
) {
  if (
    evidence.schema === 'report-style-semantic-evidence/0.1' ||
    nodes.length !== evidence.nodes.length
  )
    throw new Error('Text features unavailable for statistics.')
  const byParent = new Map<string | null, StatsNode[]>()
  const scoped = nodes.filter(
    (node) => !['header', 'footer'].includes(node.container),
  )
  const scopedRefs = new Set(scoped.map((node) => node.ref))
  const groups = new Map<
    string,
    {
      values: number[]
      ending: Map<string, number>
      prefix: Map<string, number>
      automaticMarkers: {
        number: number
        bullet: number
        none: number
        unavailable: number
        legacy: number
      }
      periods: number
      spanCandidates: Map<string, number>
      spanPartialNodes: number
    }
  >()
  let assigned = 0,
    ruleDecided = 0,
    unresolved = 0,
    inconsistent = 0
  for (const [index, node] of nodes.entries()) {
    const feature = evidence.nodes[index]
    if (feature.ref !== node.ref || !feature.textFeatures)
      throw new Error('Text feature references differ from effective tree.')
    if (!scopedRefs.has(node.ref)) continue
    const children = byParent.get(node.semanticParentRef) ?? []
    children.push(node)
    byParent.set(node.semanticParentRef, children)
    if (node.provenance === 'model' || node.provenance === 'user') assigned++
    else if (node.provenance === 'rule') ruleDecided++
    if (!node.role) unresolved++
    if (node.facts.length) inconsistent++
    if (!node.role) continue
    const group = groups.get(node.role) ?? {
      values: [] as number[],
      ending: new Map<string, number>(),
      prefix: new Map<string, number>(),
      automaticMarkers: {
        number: 0,
        bullet: 0,
        none: 0,
        unavailable: 0,
        legacy: 0,
      },
      periods: 0,
      spanCandidates: new Map<string, number>(),
      spanPartialNodes: 0,
    }
    group.values.push(feature.textFeatures.eojeolCount)
    increment(group.ending, feature.textFeatures.endingClass)
    increment(group.prefix, feature.textFeatures.prefixClass)
    const marker = feature.automaticMarker
    group.automaticMarkers[
      !marker
        ? 'legacy'
        : marker.state === 'measured'
          ? marker.kind
          : marker.state
    ]++
    if (feature.textFeatures.finalPeriod) group.periods++
    if (feature.spanCoverage === 'partial') group.spanPartialNodes++
    for (const span of feature.spans)
      for (const candidate of span.classCandidates)
        increment(group.spanCandidates, candidate.class)
    groups.set(node.role, group)
  }
  const textConventions = [...groups]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([role, group]) => {
      const values = group.values.sort((a, b) => a - b),
        n = values.length
      return {
        role,
        n,
        basis: n < 5 ? ('few' as const) : ('observed' as const),
        eojeol:
          n < 5
            ? { values }
            : {
                min: values[0],
                p10: nearest(values, 0.1),
                median: median(values),
                p90: nearest(values, 0.9),
                max: values[n - 1],
              },
        ending: counts(group.ending),
        finalPeriodRate: group.periods / n,
        prefix: counts(group.prefix),
        prefixBasis: 'visible_text' as const,
        automaticMarkers: group.automaticMarkers,
        spanCandidates: counts(group.spanCandidates),
        spanPartialNodes: group.spanPartialNodes,
      }
    })
  const grammar = new Map<string, StatsNode[][]>()
  let grammarParents = 0,
    grammarExcludedParents = 0
  for (const parent of [null, ...scoped]) {
    const role = parent === null ? 'DOCUMENT' : parent.role
    const children = byParent.get(parent?.ref ?? null) ?? []
    if (
      !role ||
      children.some((child) => !child.role || child.facts.length > 0)
    ) {
      grammarExcludedParents++
      continue
    }
    grammarParents++
    const instances = grammar.get(role) ?? []
    instances.push(children)
    grammar.set(role, instances)
  }
  const grammarObserved = [...grammar]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([parentRole, instances]) => {
      const roles = new Set(
        instances.flatMap((children) =>
          children.flatMap((child) => (child.role ? [child.role] : [])),
        ),
      )
      const children = [...roles].sort().map((role) => {
        const values = instances
          .map(
            (instance) =>
              instance.filter((child) => child.role === role).length,
          )
          .sort((a, b) => a - b)
        return {
          role,
          min: values[0],
          median: median(values),
          max: values.at(-1)!,
          presentIn: values.filter((value) => value > 0).length,
        }
      })
      const orders = new Map<string, { sequence: string[]; count: number }>()
      for (const instance of instances) {
        const sequence = instance.map((child) => child.role!)
        const key = JSON.stringify(sequence),
          entry = orders.get(key) ?? { sequence, count: 0 }
        entry.count++
        orders.set(key, entry)
      }
      const orderPatterns = [...orders.values()]
        .sort(
          (a, b) =>
            b.count - a.count ||
            (JSON.stringify(a.sequence) < JSON.stringify(b.sequence)
              ? -1
              : JSON.stringify(a.sequence) > JSON.stringify(b.sequence)
                ? 1
                : 0),
        )
        .slice(0, 3)
      return {
        parentRole,
        instances: instances.length,
        children,
        orderPatterns,
      }
    })
  return {
    schema: 'report-style-stats-preview/0.1',
    statsVersion: SEMANTIC_STATS_VERSION,
    featureBasis: 'rule_estimate',
    quantileRule: 'nearest_rank_median_mean',
    coverage: {
      nodes: nodes.length,
      excludedHeaderFooter: nodes.length - scoped.length,
      grammarOrphans: scoped.filter(
        (node) =>
          node.semanticParentRef !== null &&
          !scopedRefs.has(node.semanticParentRef),
      ).length,
      assigned,
      ruleDecided,
      unresolved,
      inconsistent,
      grammarParents,
      grammarExcludedParents,
    },
    grammarObserved,
    textConventions,
  }
}
