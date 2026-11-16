import type { StyleSnapshot } from '../../report-style/types'

import { resolvedSpacingFact, spacingBindings } from './spacing'
import { type Fact, type Model, RULES } from './types'

/** Preserve mandatory roles. Only plain variants and their orphan contexts
 * can make room for the complete model's bindings (including SPACE rules). */
export function fitPlainVariants(
  model: Model,
  snapshot?: StyleSnapshot,
): Model {
  if (model.bindings.length <= RULES.bindings) return model
  const candidates = new Map(model.bodyCandidates.map((c) => [c.ref, c]))
  const variants = model.bindings
    .flatMap((binding) => {
      const candidate = candidates.get(binding.representativeRef)
      return binding.marker.startsWith('BODY:변형') && candidate
        ? [{ binding, candidate }]
        : []
    })
    .sort(
      (a, b) =>
        a.candidate.paragraphs - b.candidate.paragraphs ||
        b.candidate.order - a.candidate.order,
    )
  let bindings = [...model.bindings]
  let blocks = model.blocks,
    spacingFacts: Fact[] = []
  const reasons: Model['roles_dropped'] = [],
    facts: Fact[] = []
  for (const { binding, candidate } of variants) {
    if (bindings.length <= RULES.bindings) break
    const removed = bindings.filter(
      (b) =>
        b.marker === binding.marker ||
        b.marker.startsWith(`SPACE:${binding.marker}:`) ||
        (b.marker.startsWith('SPACE:') &&
          b.marker.endsWith(`:${binding.marker}`)),
    )
    bindings = bindings.filter((b) => !removed.includes(b))
    blocks = blocks.map((b) =>
      b.role === binding.marker ? { ...b, role: 'BODY' } : b,
    )
    if (snapshot) {
      const roles = bindings.filter((b) => !b.marker.startsWith('SPACE:'))
      spacingFacts = []
      bindings = [
        ...roles,
        ...spacingBindings(snapshot, blocks, roles, spacingFacts),
      ]
    }
    reasons.push(
      ...removed.map((b) => ({
        marker: b.marker,
        ref: b.representativeRef,
        reason: b === binding ? 'binding_limit' : 'orphan_context',
      })),
    )
    facts.push({
      step: 6,
      rule: 'roles_dropped',
      refs: model.blocks
        .filter((b) => b.role === binding.marker)
        .map((b) => b.ref),
      value: {
        marker: binding.marker,
        reason: 'binding_limit',
        paragraphs: candidate.paragraphs,
        order: candidate.order,
      },
    })
  }
  return {
    ...model,
    bindings,
    blocks,
    roles_dropped: [...model.roles_dropped, ...reasons],
    facts: [
      ...model.facts.filter(
        (f) =>
          !snapshot ||
          !['spacing_rule_unsupported', 'resolved_role_spacing'].includes(
            f.rule,
          ),
      ),
      ...facts,
      ...spacingFacts,
      ...(snapshot ? [resolvedSpacingFact(bindings)] : []),
    ].sort((a, b) => a.step - b.step),
  }
}
