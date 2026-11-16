import type {
  ApplicationKey,
  DecompositionFacts,
  HierarchyJudgement,
} from '../dialectV2'

import type { HierarchyFeature } from './features'
import { required } from './required'

export const hasHierarchyMarker = (j: HierarchyJudgement) =>
  !!j.marker.symbol || !!j.semanticRole || j.rule === 'R0' || j.rule === 'R2'
export function applicationKey(
  depth: number,
  role: string | null,
  marked: boolean,
): ApplicationKey {
  if (!marked) return 'BODY'
  return (
    depth <= 6
      ? `H${depth}${role ? ':' + role : ''}`
      : `BODY:${role ?? '깊은단계'}`
  ) as ApplicationKey
}
export type KeyOccurrence = {
  key: ApplicationKey
  shape: string | null
  ref: string
  styleShape: string
}
export type RuleSummary = {
  key: ApplicationKey
  shape: string | null
  count: number
  order: number
  representativeRef: string
}
export function assignShapes(items: KeyOccurrence[]) {
  const groups = new Map<ApplicationKey, KeyOccurrence[]>()
  for (const item of items)
    groups.set(item.key, [...(groups.get(item.key) ?? []), item])
  const assignments = new Map<string, ApplicationKey>(),
    rules: RuleSummary[] = []
  const facts: DecompositionFacts = {}
  let system = 2
  for (const [key, group] of groups) {
    const shapes = new Map<string | null, KeyOccurrence[]>()
    for (const item of group)
      shapes.set(item.shape, [...(shapes.get(item.shape) ?? []), item])
    const representative = [...shapes].sort(
      (a, b) => b[1].length - a[1].length,
    )[0][0]
    for (const [shape, occurrences] of shapes) {
      const target =
        shape === representative
          ? key
          : (`${key.split(':')[0]}:기호${system++}` as ApplicationKey)
      const styles = new Map<string, KeyOccurrence[]>()
      for (const item of occurrences)
        styles.set(item.styleShape, [
          ...(styles.get(item.styleShape) ?? []),
          item,
        ])
      const chosen = [...styles.values()].sort(
        (a, b) => b.length - a.length,
      )[0][0]
      const count = occurrences.filter(
        (o) => o.styleShape !== chosen.styleShape,
      ).length
      if (count)
        (facts.unifiedDifferences ??= []).push({
          key: target,
          count,
          representativeRef: chosen.ref,
        })
      rules.push({
        key: target,
        shape,
        count: occurrences.length,
        order: items.indexOf(occurrences[0]),
        representativeRef: chosen.ref,
      })
      for (const o of occurrences) assignments.set(o.ref, target)
    }
  }
  return { assignments, rules, facts }
}
export function assignKeys(
  judgements: HierarchyJudgement[],
  features: HierarchyFeature[],
) {
  const byRef = new Map(features.map((f) => [f.ref, f]))
  const result = assignShapes(
    judgements.map((j) => ({
      key: applicationKey(j.depth, j.semanticRole, hasHierarchyMarker(j)),
      shape: j.marker.series ?? j.marker.symbol,
      ref: j.ref,
      styleShape:
        byRef.get(j.ref)?.styleShape ??
        JSON.stringify([byRef.get(j.ref)?.sizePt, byRef.get(j.ref)?.faceClass]),
    })),
  )
  return {
    ...result,
    judgements: judgements.map((j) => ({
      ...j,
      applicationKey: required(result.assignments.get(j.ref)),
    })),
  }
}
