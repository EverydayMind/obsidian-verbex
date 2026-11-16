import type { BindingCandidate } from '../../report-style/bindingCandidates'

import { type Fact, RULES } from './types'

type Assign = (marker: string, candidate: BindingCandidate) => void
export function addPlainVariants(
  plain: BindingCandidate[],
  chosen: BindingCandidate | undefined,
  add: Assign,
  assign: Assign,
  facts: Fact[],
): void {
  let variant = 0
  for (const candidate of plain
    .filter((c) => c !== chosen)
    .sort((a, b) => a.order - b.order)) {
    if (candidate.paragraphs < RULES.variantMinParagraphs) {
      assign('BODY', candidate)
      facts.push({ step: 6, rule: 'singleton_style', refs: [candidate.ref] })
    } else add(`BODY:변형${++variant}`, candidate)
  }
}
