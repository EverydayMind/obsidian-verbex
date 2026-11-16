import type { Binding } from '../../../report-style/types'
import type { HierarchyJudgement } from '../dialectV2'
import type { Model } from '../types'

import type { HierarchyFeature } from './features'
import { contentOffset } from './inline'
import type { RuleSummary } from './keys'
import type { SpacingContext } from './limits'
/** Use the exact writer offset, restricted to characters present in the source. */
export function hierarchyBindings(
  model: Model,
  features: HierarchyFeature[],
  judgements: HierarchyJudgement[],
  rules: RuleSummary[],
  contexts: SpacingContext[],
  leadingSpacerRefs: Map<string, string | null>,
) {
  const bindings: Binding[] = [],
    prefixes = new Map<string, string>()
  const add = (key: string, representativeRef: string) => {
    const ref = leadingSpacerRefs.get(key)
    bindings.push({
      key,
      marker: key,
      representativeRef,
      assignedBy: 'rule',
      ...(ref ? { leadingSpacerRef: ref } : {}),
    })
  }
  for (const rule of rules) {
    const feature = features.find((f) => f.ref === rule.representativeRef),
      judgement = judgements.find((j) => j.ref === rule.representativeRef)
    const representativeRef = feature?.sourceRef ?? rule.representativeRef
    let prefix = ''
    if (
      feature &&
      judgement &&
      rule.key !== 'BODY' &&
      judgement.rule !== 'R0' &&
      judgement.semanticRole !== '보고자'
    ) {
      const source = model.blocks.find((b) => b.ref === feature.ref)
      const text = source?.table
        ? source.cells.find((c) => c.paragraphRefs.includes(representativeRef))
            ?.text
        : source?.text
      const removed = [...feature.text]
        .slice(0, contentOffset(feature, judgement))
        .join('')
      // Deep numbering is written as text. Snapshot-only numbering is not text.
      if (
        !(judgement.depth >= 7 && judgement.marker.series) &&
        removed &&
        text?.startsWith(removed)
      )
        prefix = removed
    }
    add(rule.key, representativeRef)
    prefixes.set(rule.key, prefix)
  }
  for (const context of contexts) {
    if (!context.representativeRef) continue
    add(context.key, context.representativeRef)
    prefixes.set(context.key, '')
  }
  model.bindings = bindings
  model.blocks = model.blocks.map((b) => {
    const judgement = judgements.find((j) => j.ref === b.ref)
    return judgement
      ? {
          ...b,
          role: judgement.applicationKey,
          representativeRef:
            features.find((f) => f.ref === b.ref)?.sourceRef ?? b.ref,
        }
      : b
  })
  return { bindings, prefixes }
}
