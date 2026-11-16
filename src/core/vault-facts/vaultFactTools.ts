import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import type { RequestTool } from '../../types/llm/request'

import { getAuditLinksDefinition } from './auditLinksDefinition'
import {
  VAULT_FACT_TOOL_NAMES,
  getNoteQueryDefinitions,
  noteRead as read,
} from './noteQueryDefinitions'
import { getVaultCalculationDefinitions } from './vaultCalculationDefinitions'

export { VAULT_FACT_TOOL_NAMES } from './noteQueryDefinitions'
const names = new Set<string>(VAULT_FACT_TOOL_NAMES)
export const isVaultFactTool = (name: string): boolean => names.has(name)
export function getVaultFactToolDefinitions(
  _locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  return [
    ...getVaultCalculationDefinitions(_locale),
    ...getNoteQueryDefinitions(_locale),
    getAuditLinksDefinition(_locale),
  ]
}
export const VAULT_FACT_TOOL_DEFINITIONS = getVaultFactToolDefinitions()
export const VAULT_FACT_TOOL_REGISTRY = Object.fromEntries(
  VAULT_FACT_TOOL_NAMES.map((name) => [name, read]),
)
