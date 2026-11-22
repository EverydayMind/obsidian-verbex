import { L } from '../i18n/modelText'
import type { JsonObject } from '../provider/interop/protocol'

import { documentJobRules } from './documentJobRuleRenderer'
export { documentJobRules } from './documentJobRuleRenderer'

export function formatSelectionGuidance(): string {
  return L({
    ko: 'roles와 본보기는 쓸 수 있는 서식 목록이다. 새 문서에 필요한 절만 골라 쓰고, 샘플 자체에 관한 절(견본 안내, 작성 체크리스트 같은 작성 지침)은 새 문서에 옮기지 않는다.',
    en: 'roles and the exemplar list formats you may use. Write only the sections the new document needs; do not carry over sections about the sample itself (sample notices, writing checklists and similar guidance).',
  })
}

export function preparationRules(result: Record<string, unknown>): string[] {
  const contract = result.draft_contract
  return result.state === 'ready' &&
    contract &&
    typeof contract === 'object' &&
    !Array.isArray(contract)
    ? [documentJobRules(contract as JsonObject)]
    : []
}
