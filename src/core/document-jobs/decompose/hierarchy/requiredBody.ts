import { buildStructureModel } from '../model'
import type { Model, ModelInput } from '../types'

import type { RuleSummary } from './keys'

export async function withRequiredBody(
  input: ModelInput,
  model: Model,
  original: RuleSummary[],
  bodyRef?: string,
) {
  const rules = [...original]
  if (!rules.some((r) => r.key === 'BODY')) {
    const legacy = await buildStructureModel(input)
    model.bodyNeedsChoice = legacy.bodyNeedsChoice
    model.bodyCandidates = legacy.bodyCandidates
    model.body_source = legacy.body_source
    rules.push({
      key: 'BODY',
      shape: null,
      count: 0,
      order: -1,
      representativeRef:
        (legacy.bodyNeedsChoice ? bodyRef : undefined) ??
        legacy.bindings.find((b) => b.marker === 'BODY')?.representativeRef ??
        '',
    })
  }
  return rules
}
