import type { DecompositionFacts, HierarchyJudgement } from '../dialectV2'

import type { HierarchyFeature } from './features'
import { sectionNumber, seriesText } from './markers'

export function numberHierarchy(
  judgements: HierarchyJudgement[],
  features: HierarchyFeature[],
) {
  const facts: DecompositionFacts = {},
    prefixes = new Map<string, string>()
  type Sequence = {
    key: HierarchyJudgement['applicationKey']
    refs: string[]
    values: (number | null)[]
    numbered: boolean
  }
  const sequences: Sequence[] = [],
    active = new Map<string, Sequence>()
  const byRef = new Map(features.map((f) => [f.ref, f]))
  for (const j of judgements) {
    if (j.applicationKey.startsWith('H')) {
      for (const [key, seq] of active)
        if (seq.key.startsWith('H') && Number(seq.key.slice(1, 2)) > j.depth)
          active.delete(key)
    }
    const token =
      j.rule === 'R2' ? sectionNumber(byRef.get(j.ref)?.text ?? '') : null
    const source =
      j.marker.value ?? (token === null ? null : Number(token.slice(0, -1)))
    const numbered =
      !!j.marker.series ||
      token !== null ||
      j.semanticRole === '번호_매기기_제목'
    if (!j.applicationKey.startsWith('H') && !numbered) continue
    const scope =
      j.depth >= 7
        ? JSON.stringify([j.parentRef, j.applicationKey])
        : j.applicationKey
    let seq = active.get(scope)
    if (!seq) {
      seq = { key: j.applicationKey, refs: [], values: [], numbered: false }
      sequences.push(seq)
      active.set(scope, seq)
    }
    seq.refs.push(j.ref)
    seq.values.push(source)
    seq.numbered ||= numbered
    if (j.depth >= 7 && j.marker.series) {
      const value = seq.refs.length,
        symbol = seriesText(j.marker.series, value)
      prefixes.set(j.ref, (symbol ?? String(value)) + ' ')
      if (!symbol)
        (facts.counter_out_of_range ??= []).push({
          key: j.applicationKey,
          ref: j.ref,
          series: j.marker.series,
          value,
        })
    }
  }
  for (const s of sequences)
    if (s.numbered && s.values.some((v, i) => v !== i + 1))
      (facts.sourceNumberingDiscontinuity ??= []).push({
        key: s.key,
        refs: s.refs,
        sourceValues: s.values,
      })
  return { facts, prefixes }
}
