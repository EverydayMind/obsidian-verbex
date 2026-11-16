import type { DraftRoleNode } from './draftRoleProjection'
import type { summarizeSemanticStructure } from './semanticStats'

type Summary = ReturnType<typeof summarizeSemanticStructure>
type Fact =
  | {
      kind: 'prefix_ordinal_discontinuity'
      parentIndex: number | null
      index: number
      previousIndex: number
      role: string
      prefixClass: string
      previous: number
      actual: number
      expected: number
    }
  | {
      kind: 'grammar_outside_range'
      parentIndex: number | null
      parentRole: string
      role: string
      actual: number
      min: number
      max: number
    }
  | {
      kind: 'grammar_role_not_observed'
      parentIndex: number | null
      parentRole: string
      role: string
      actual: number
    }
  | {
      kind: 'eojeol_outside_range'
      index: number
      role: string
      actual: number
      p10: number
      p90: number
    }
  | {
      kind: 'style_fallback'
      index: number
      role: string | null
      source: 'block' | 'cell'
      reasons: string[]
    }

const increment = (map: Map<string, number>, key: string) =>
  map.set(key, (map.get(key) ?? 0) + 1)
const sorted = (map: Map<string, number>) =>
  Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b, 'en')))

/** Facts only; unresolved roles and incomplete parent instances never enter role comparisons. */
export function compareDraftToStats(
  nodes: readonly DraftRoleNode[],
  sample: Summary | null,
) {
  const facts: Fact[] = [],
    children = new Map<number | null, DraftRoleNode[]>(),
    counts = new Map<string, number>(),
    endings = new Map<string, Map<string, number>>(),
    phrases = new Map<
      string,
      {
        candidates: Map<string, number>
        observedNodes: number
        truncatedNodes: number
        unavailableNodes: number
        scopes: Set<'delimited_only' | 'delimited_and_cell_runs'>
        runCoverage: {
          observed: number
          unavailable: number
          not_applicable: number
          legacy: number
        }
      }
    >()
  let ambiguous = 0,
    unmapped = 0,
    missingText = 0,
    grammarExcluded = 0,
    grammarUnobserved = 0
  for (const node of nodes) {
    const siblings = children.get(node.parentIndex) ?? []
    siblings.push(node)
    children.set(node.parentIndex, siblings)
    if (node.state === 'resolved' && node.role) {
      increment(counts, node.role)
      const phrase = phrases.get(node.role) ?? {
        candidates: new Map<string, number>(),
        observedNodes: 0,
        truncatedNodes: 0,
        unavailableNodes: 0,
        scopes: new Set<'delimited_only' | 'delimited_and_cell_runs'>(),
        runCoverage: {
          observed: 0,
          unavailable: 0,
          not_applicable: 0,
          legacy: 0,
        },
      }
      if (node.text.state === 'observed' && node.text.semantics) {
        phrase.observedNodes++
        phrase.scopes.add(node.text.semantics.phrases.scope)
        phrase.runCoverage[
          node.text.semantics.phrases.runCoverage ?? 'legacy'
        ]++
        if (node.text.semantics.phrases.truncated) phrase.truncatedNodes++
        for (const [key, count] of Object.entries(
          node.text.semantics.phrases.candidates,
        ))
          phrase.candidates.set(key, (phrase.candidates.get(key) ?? 0) + count)
      } else phrase.unavailableNodes++
      phrases.set(node.role, phrase)
      if (node.text.state === 'observed' && node.text.features) {
        const perRole = endings.get(node.role) ?? new Map<string, number>()
        increment(perRole, node.text.features.endingClass)
        endings.set(node.role, perRole)
        const sampleRole = sample?.textConventions.find(
          (entry) => entry.role === node.role,
        )
        if (
          sampleRole?.basis === 'observed' &&
          'p10' in sampleRole.eojeol &&
          'p90' in sampleRole.eojeol
        ) {
          const actual = node.text.features.eojeolCount,
            { p10, p90 } = sampleRole.eojeol
          if (
            typeof p10 === 'number' &&
            typeof p90 === 'number' &&
            (actual < p10 || actual > p90)
          )
            facts.push({
              kind: 'eojeol_outside_range',
              index: node.index,
              role: node.role,
              actual,
              p10,
              p90,
            })
        }
      } else missingText++
    } else if (node.state === 'ambiguous') ambiguous++
    else unmapped++
    if (node.fallbacks.length)
      facts.push({
        kind: 'style_fallback',
        index: node.index,
        role: node.role,
        source: 'block',
        reasons: node.fallbacks,
      })
    if (node.inheritedCell?.fallbacks.length)
      facts.push({
        kind: 'style_fallback',
        index: node.index,
        role: node.role,
        source: 'cell',
        reasons: node.inheritedCell.fallbacks,
      })
  }
  const grammar = new Map(
    (sample?.grammarObserved ?? []).map((entry) => [entry.parentRole, entry]),
  )
  let ordinalPairs = 0
  for (const parent of [null, ...nodes]) {
    if (parent && (parent.state !== 'resolved' || !parent.role)) continue
    let previous: {
      index: number
      role: string
      cls: string
      value: number
    } | null = null
    for (const node of children.get(parent?.index ?? null) ?? []) {
      const ordinal = node.text.semantics?.prefixOrdinal
      const cls = node.text.features?.prefixClass
      if (
        node.state !== 'resolved' ||
        !node.role ||
        node.kind === 'list_item' ||
        node.text.state !== 'observed' ||
        ordinal?.state !== 'known' ||
        !cls
      ) {
        previous = null
        continue
      }
      if (previous && previous.role === node.role && previous.cls === cls) {
        ordinalPairs++
        if (ordinal.value !== previous.value + 1)
          facts.push({
            kind: 'prefix_ordinal_discontinuity',
            parentIndex: parent?.index ?? null,
            index: node.index,
            previousIndex: previous.index,
            role: node.role,
            prefixClass: cls,
            previous: previous.value,
            actual: ordinal.value,
            expected: previous.value + 1,
          })
      }
      previous = {
        index: node.index,
        role: node.role,
        cls,
        value: ordinal.value,
      }
    }
  }
  for (const parent of [null, ...nodes]) {
    const parentRole = parent === null ? 'DOCUMENT' : parent.role
    const members = children.get(parent?.index ?? null) ?? []
    if (
      !parentRole ||
      members.some((child) => child.state !== 'resolved' || !child.role)
    ) {
      grammarExcluded++
      continue
    }
    const observed = grammar.get(parentRole)
    if (!observed) {
      grammarUnobserved++
      continue
    }
    const actual = new Map<string, number>()
    for (const child of members) if (child.role) increment(actual, child.role)
    const expected = new Map(
      observed.children.map((entry) => [entry.role, entry]),
    )
    for (const role of new Set([...actual.keys(), ...expected.keys()])) {
      const count = actual.get(role) ?? 0,
        range = expected.get(role)
      if (!range)
        facts.push({
          kind: 'grammar_role_not_observed',
          parentIndex: parent?.index ?? null,
          parentRole,
          role,
          actual: count,
        })
      else if (count < range.min || count > range.max)
        facts.push({
          kind: 'grammar_outside_range',
          parentIndex: parent?.index ?? null,
          parentRole,
          role,
          actual: count,
          min: range.min,
          max: range.max,
        })
      if (facts.length > 100000)
        return {
          state: 'unavailable' as const,
          reason: 'fact_budget' as const,
          facts: [],
        }
    }
  }
  if (facts.length > 100000)
    return {
      state: 'unavailable' as const,
      reason: 'fact_budget' as const,
      facts: [],
    }
  return {
    state: 'available' as const,
    statsState: sample
      ? ('computed_preview' as const)
      : ('unavailable' as const),
    coverage: {
      partialStructure: true,
      resolved: [...counts.values()].reduce((a, b) => a + b, 0),
      ambiguous,
      unmapped,
      missingText,
      grammarExcluded,
      grammarUnobserved,
      ordinalPairs,
    },
    roleCounts: sorted(counts),
    endingDistributions: [...counts.keys()].sort().map((role) => ({
      role,
      draft: sorted(endings.get(role) ?? new Map<string, number>()),
      observed:
        sample?.textConventions.find((entry) => entry.role === role)?.ending ??
        null,
    })),
    phraseCandidateDistributions: [...phrases]
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([role, value]) => ({
        role,
        draftScope:
          value.scopes.size === 0
            ? ('unavailable' as const)
            : value.scopes.size > 1
              ? ('mixed' as const)
              : [...value.scopes][0],
        runCoverage: value.runCoverage,
        draft: sorted(value.candidates),
        observedNodes: value.observedNodes,
        truncatedNodes: value.truncatedNodes,
        unavailableNodes: value.unavailableNodes,
        sampleScope: 'delimited_and_distinct_run' as const,
        sample:
          sample?.textConventions.find((entry) => entry.role === role)
            ?.spanCandidates ?? null,
        samplePartialNodes:
          sample?.textConventions.find((entry) => entry.role === role)
            ?.spanPartialNodes ?? null,
      })),
    unsupported: [
      'automatic_numbering_sequence',
      'unverified_styled_run_transitions',
    ] as const,
    facts,
  }
}
