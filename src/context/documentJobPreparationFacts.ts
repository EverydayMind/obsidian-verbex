import type { JsonObject } from '../provider/interop/protocol'
import type { TurnRecord } from '../runstate/turnLedger'

import {
  conditionalContractLines,
  isContractObject,
  preparationRemainder,
} from './documentJobContractView'
import { DOCUMENT_JOB_OUTPUT_NAME_GUIDANCE } from './documentJobPendingFacts'
import {
  STRUCTURAL_PREPARATION_CONDITION,
  STRUCTURAL_PREPARATION_HEADER,
  STRUCTURAL_PREPARATION_RULES,
} from './documentJobPreparationGuidance'
import { PREPARATION_HEADER } from './documentJobPreparationText'

type Preparation = NonNullable<TurnRecord['documentJobPreparation']>
export function formatDocumentJobPreparation(
  preparation: Preparation,
): string[] {
  const result = preparation.result
  const { draft_rules: _, draft_contract, nextStep, recovery, ...rest } = result
  const cause = (result.details as JsonObject)?.cause
  const essentials: JsonObject = {
    ...(preparation.trigger ? { trigger: preparation.trigger } : {}),
    state: result.state,
    ...(result.decomposition
      ? { decomposition: { state: (result.decomposition as JsonObject).state } }
      : {}),
    ...(cause !== undefined ? { cause } : {}),
    ...(recovery !== undefined ? { recovery } : {}),
    ...(typeof result.job_id === 'string' ? { job_id: result.job_id } : {}),
    ...(nextStep !== undefined ? { nextStep } : {}),
  } as JsonObject
  const lines = [
    preparation.trigger === 'structural'
      ? STRUCTURAL_PREPARATION_HEADER()
      : PREPARATION_HEADER(),
    JSON.stringify(essentials),
  ]
  if (preparation.trigger === 'structural')
    lines.push(STRUCTURAL_PREPARATION_RULES())
  if (result.state === 'ready' && nextStep !== undefined)
    lines.push(DOCUMENT_JOB_OUTPUT_NAME_GUIDANCE())
  if (result.state === 'ready' && isContractObject(draft_contract))
    lines.push(
      ...conditionalContractLines(
        draft_contract,
        preparation.trigger === 'structural'
          ? STRUCTURAL_PREPARATION_CONDITION()
          : '',
      ),
    )
  const remainder = preparationRemainder(rest, preparation.samplePath)
  if (Object.keys(remainder).length) lines.push(JSON.stringify(remainder))
  return lines
}
