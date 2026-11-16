import { decompositionDraftContract } from '../../core/document-jobs/decompose/draftContract'
import { stringifyUnknown } from '../../utils/stringifyUnknown'

import {
  type Analysis,
  decompositionContractInput,
} from './decompositionContractInput'
import type { JsonObject } from './protocol'
export function preparedDecomposition(analysis: Analysis) {
  const { model, pair, decomposition, bundle } = analysis
  return {
    state: 'ready' as const,
    bundle,
    rolePrefixes: decompositionContractInput(analysis).rolePrefixes,
    bindings: model.bindings,
    rolesDropped: model.roles_dropped.map((d) => d.marker),
    droppedBindings: [],
    contextsDropped: [],
    roleDropReasons: Object.fromEntries(
      model.roles_dropped.map((d) => [d.marker, d.reason]),
    ),
    decomposition,
    ...(pair
      ? {
          template: {
            path: pair.path,
            textPath: pair.textPath,
            sha256: pair.sha256,
            state: pair.templateState,
            dialect: pair.record?.dialect,
            rulesVersion: pair.record?.rulesVersion,
            catalogVersion: pair.record?.catalogVersion,
            sourcePath: pair.record?.sourcePath,
            sourceSha256: pair.record?.sourceSha256,
          },
        }
      : {}),
    extendContract: (base: JsonObject) =>
      decompositionDraftContract({
        base,
        dialect: String(bundle.dialect),
        ...decompositionContractInput(analysis),
        meta: pair?.frontmatter ?? model.meta,
        templatePath: stringifyUnknown(decomposition.facts.template_path),
        textPath: stringifyUnknown(decomposition.facts.text_path),
        differences: (decomposition.facts.fitness as JsonObject)?.differences,
      }),
  }
}
