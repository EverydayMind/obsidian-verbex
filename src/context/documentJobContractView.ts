import { L } from '../i18n/modelText'
import type { JsonObject } from '../provider/interop/protocol'

import { compactDecomposition } from './compactDecomposition'
import { documentJobRules, formatSelectionGuidance } from './documentJobRules'

/** Render a contract without changing the preparation or its stored facts. */
export function draftContractLines(contract: JsonObject): string[] {
  const { roles, reference_excerpt, ...rest } = contract
  if (contract.dialect === 'hwpx-exporter-md/2') delete rest.syntax_guidance
  const lines = [
    documentJobRules(contract),
    `draft_contract.roles: ${JSON.stringify(roles ?? {})}`,
    formatSelectionGuidance(),
  ]
  if (typeof reference_excerpt === 'string' && reference_excerpt.length > 0)
    lines.push(
      L({
        ko: `draft_contract.reference_excerpt(서식 본보기: 샘플 문서의 글. 이 글과 roles의 '원본 예'·frontmatter META 값은 서식 근거이며 새 문서의 사실·수치 근거가 아님): ${JSON.stringify(reference_excerpt)}`,
        en: `draft_contract.reference_excerpt(format exemplar: sample document text. This text, the original examples in roles, and frontmatter META values are format evidence, not factual or numerical evidence for the new document): ${JSON.stringify(reference_excerpt)}`,
      }),
    )
  lines.push(
    L({
      ko: 'draft_contract(그 밖의 키): ',
      en: `draft_contract(other keys): `,
    }) + JSON.stringify(rest),
  )
  return lines
}

/** Omit only bulky measurements from the model-facing decomposition view. */

export function isContractObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function conditionalContractLines(
  contract: JsonObject,
  condition: string,
): string[] {
  const lines = draftContractLines(contract)
  if (condition) lines[0] = condition + ': ' + lines[0]
  return lines
}

export function preparationRemainder(
  rest: Record<string, unknown>,
  samplePath: string,
): Record<string, unknown> {
  const remainder: Record<string, unknown> = { ...rest, samplePath }
  delete remainder.state
  delete remainder.job_id
  if (remainder.decomposition !== undefined)
    remainder.decomposition = compactDecomposition(remainder.decomposition)
  return remainder
}
export { compactDecomposition } from './compactDecomposition'
