import { noteFormat } from '../../../../i18n/noteFormats'
import * as dialect from '../dialectV2'
import type { ModelInput } from '../types'

import { hierarchyBindings } from './bindings'
import { judgeHierarchy } from './judge'
import { assignKeys } from './keys'
import { type SpacingContext, reduceRulesByLimit } from './limits'
import { prepareHierarchy } from './prepare'
import { withRequiredBody } from './requiredBody'
import { measureSpacing } from './spacing'
import { writeHierarchyMarkdown } from './writer'
export async function buildHierarchyDecompositionV2(
  input: ModelInput,
  options: {
    templateName?: string
    decompositionId?: string
    spacingContexts?: SpacingContext[]
    bodyRef?: string
  } = {},
) {
  const { features, model } = await prepareHierarchy(input)
  const keyed = assignKeys(judgeHierarchy(features), features)
  const { bodyRef } = options
  const rules = await withRequiredBody(input, model, keyed.rules, bodyRef)
  const measured = measureSpacing(
    input.snapshot,
    model.blocks,
    keyed.judgements,
    rules,
  )
  const spacing = options.spacingContexts ?? measured.spacing
  const reduction = reduceRulesByLimit(rules, spacing)
  const judgements = keyed.judgements.map((j) => ({
    ...j,
    applicationKey:
      reduction.remapping.get(j.applicationKey) ?? j.applicationKey,
  }))
  const activeRules = rules.filter((r) =>
    reduction.rules.some((a) => a.key === r.key),
  )
  const { prefixes } = hierarchyBindings(
    model,
    features,
    judgements,
    activeRules,
    reduction.spacingContexts,
    measured.leadingSpacerRefs,
  )
  const written = writeHierarchyMarkdown({
    model,
    features,
    judgements,
    templateName: options.templateName ?? noteFormat('defaultTemplate'),
    decompositionId: options.decompositionId ?? 'hierarchy-preview',
    sourceSha256: input.snapshot.source.sha256,
  })
  return {
    dialect: dialect.MD_DIALECT_V2,
    rulesVersion: dialect.HIERARCHY_RULES_VERSION,
    catalogVersion: dialect.ROLE_CATALOG_VERSION,
    features,
    judgements,
    reduction,
    facts: {
      ...keyed.facts,
      ...measured.facts,
      ...reduction.facts,
      ...written.facts,
    },
    markdown: written.markdown,
    blocked: reduction.blocked,
    prefixes,
    rules: activeRules,
    model,
  }
}
