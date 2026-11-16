import type { JsonObject } from '../provider/interop/protocol'

import { documentJobRules } from './documentJobRuleRenderer'
export { documentJobRules } from './documentJobRuleRenderer'

export function preparationRules(result: Record<string, unknown>): string[] {
  const contract = result.draft_contract
  return result.state === 'ready' &&
    contract &&
    typeof contract === 'object' &&
    !Array.isArray(contract)
    ? [documentJobRules(contract as JsonObject)]
    : []
}
