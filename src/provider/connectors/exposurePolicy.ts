import { RequestTool } from '../../types/llm/request'
import { matchesRequestKeyword } from '../requestKeyword'
import { toolDefinitionTokenCount } from '../toolDefinitionTokenCount'

import { ConnectorTool } from './manifestSchema'

export const MAX_CONNECTOR_TOOLS = 8
export const MAX_CONNECTOR_DEFINITION_TOKENS = 1500
export type ConnectorExposure = {
  text: string
  simple: boolean
  skillTools: readonly string[]
  pinnedTools: readonly string[]
}

export async function selectConnectorTools(
  entries: { definition: RequestTool; tool: ConnectorTool }[],
  policy: ConnectorExposure,
): Promise<{ definitions: RequestTool[]; omitted: number; tokens: number }> {
  const ranked = entries
    .map((entry) => {
      const name = entry.definition.function.name
      const rank = policy.pinnedTools.includes(name)
        ? 0
        : policy.skillTools.includes(name)
          ? 1
          : !policy.simple &&
              entry.tool.routeKeywords.some((keyword) =>
                matchesRequestKeyword(policy.text, keyword),
              )
            ? 2
            : 3
      return { ...entry, rank }
    })
    .filter((entry) => entry.rank < 3)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.definition.function.name.localeCompare(
          b.definition.function.name,
          'en',
        ),
    )
  const definitions: RequestTool[] = []
  let tokens = 0
  for (const entry of ranked) {
    const cost = await toolDefinitionTokenCount(entry.definition)
    if (
      definitions.length >= MAX_CONNECTOR_TOOLS ||
      tokens + cost > MAX_CONNECTOR_DEFINITION_TOKENS
    )
      continue
    tokens += cost
    definitions.push(entry.definition)
  }
  return { definitions, tokens, omitted: ranked.length - definitions.length }
}
