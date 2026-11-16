import type { ApplicationKey, DecompositionFacts } from '../dialectV2'

import { isCatalogRole } from './roleCatalog'

export type LimitRule = {
  key: ApplicationKey
  shape: string | null
  count: number
  order: number
}
export type SpacingContext = {
  key: string
  count: number
  order: number
  representativeRef?: string
}
export function reduceRulesByLimit(
  input: LimitRule[],
  spacing: SpacingContext[],
) {
  const rules = input.map((r) => ({ ...r })),
    contexts = spacing.map((s) => ({ ...s }))
  const remapping = new Map<ApplicationKey, ApplicationKey>()
  const facts: DecompositionFacts = {}
  const exceeds = () => rules.length > 14 || rules.length + contexts.length > 24
  const priority = (
    a: { count: number; order: number },
    b: { count: number; order: number },
  ) => a.count - b.count || b.order - a.order
  for (const context of [...contexts].sort(priority)) {
    if (!exceeds()) break
    contexts.splice(contexts.indexOf(context), 1)
    ;(facts.spacingContextsDropped ??= []).push({
      contextKey: context.key,
      count: context.count,
    })
  }
  for (const rule of [...rules].sort(priority)) {
    if (!exceeds()) break
    const [base, role] = rule.key.split(':')
    if (!role || !isCatalogRole(role)) continue
    const toKey = (base === 'BODY' ? 'BODY:깊은단계' : base) as ApplicationKey
    const destination = rules.find(
      (r) => r.key === toKey && r.shape === rule.shape,
    )
    if (!destination) continue
    remapping.set(rule.key, toKey)
    destination.count += rule.count
    rules.splice(rules.indexOf(rule), 1)
    ;(facts.rulesReducedByLimit ??= []).push({
      fromKey: rule.key,
      toKey,
      count: rule.count,
    })
  }
  if (exceeds())
    facts.rule_limit_exceeded = [
      {
        nonSpaceRules: rules.length,
        bundleRules: rules.length + contexts.length,
        nonSpaceLimit: 14,
        bundleLimit: 24,
        irreducibleKeys: rules.map((r) => r.key),
      },
    ]
  return {
    rules,
    spacingContexts: contexts,
    remapping,
    facts,
    blocked: exceeds(),
  }
}

export type Occurrence = { ref: string; signature: string; order: number }
export const modal = (group: Occurrence[]) => {
  const counts = new Map<string, number>()
  for (const item of group)
    counts.set(item.signature, (counts.get(item.signature) ?? 0) + 1)
  return [...group].sort(
    (a, b) =>
      (counts.get(b.signature) ?? 0) - (counts.get(a.signature) ?? 0) ||
      a.order - b.order,
  )[0]
}
