import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import type { RequestTool } from '../../types/llm/request'
import {
  CORE_TOOL_REGISTRY,
  getCoreToolDefinitions,
} from '../obsidian-core/coreTools'
import { TIDY_TOOL_REGISTRY, getTidyToolDefinitions } from '../tidy/tidyTools'
import * as vaultFacts from '../vault-facts/vaultFactTools'

import type { ToolRegistryEntry } from './toolRegistryEntry'

export const FAMILY_TOOL_REGISTRY: Record<
  string,
  Omit<ToolRegistryEntry, 'definition'>
> = {
  ...TIDY_TOOL_REGISTRY,
  ...vaultFacts.VAULT_FACT_TOOL_REGISTRY,
  ...CORE_TOOL_REGISTRY,
}

export function getFamilyToolDefinitions(
  locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  return [
    ...getTidyToolDefinitions(locale),
    ...vaultFacts.getVaultFactToolDefinitions(locale),
    ...getCoreToolDefinitions(locale),
  ]
}
