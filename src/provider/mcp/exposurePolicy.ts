import type { McpAgentEntry } from '../../core/mcp/toolCatalog'
import type { ConnectorExposure } from '../connectors/exposurePolicy'
import { matchesRequestKeyword } from '../requestKeyword'
import { toolDefinitionTokenCount } from '../toolDefinitionTokenCount'

// Description-derived keywords must describe a capability, not English glue words.
const ENGLISH_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'these',
  'those',
  'from',
  'into',
  'your',
  'you',
  'our',
  'its',
  'are',
  'was',
  'were',
  'has',
  'have',
  'can',
  'will',
  'not',
  'all',
  'any',
  'use',
  'using',
])

export async function selectMcpTools(
  entries: readonly McpAgentEntry[],
  policy: ConnectorExposure,
) {
  const text = policy.text.toLowerCase()
  const mentions = new Set(text.match(/[a-z0-9_-]+/g) ?? [])
  const ranked = entries
    .map((entry) => {
      const keywords =
        `${entry.serverName} ${entry.tool.name} ${entry.tool.title ?? ''} ${(entry.tool.description ?? '').slice(0, 512)}`
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((word) => word.length >= (/^[가-힣]+$/.test(word) ? 2 : 3))
          .filter((word) => !ENGLISH_STOPWORDS.has(word))
      const rank = policy.pinnedTools.includes(entry.name)
        ? 0
        : policy.skillTools.includes(entry.name)
          ? 1
          : mentions.has(entry.name.toLowerCase()) ||
              mentions.has(entry.tool.name.toLowerCase())
            ? 2
            : !policy.simple &&
                keywords.some((word) => matchesRequestKeyword(text, word))
              ? 3
              : 4
      return { ...entry, rank }
    })
    .filter((entry) => entry.rank < 4)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'en'))
  const definitions = []
  let tokens = 0
  for (const entry of ranked) {
    const cost = await toolDefinitionTokenCount(entry.definition)
    if (definitions.length >= 8 || tokens + cost > 1500) continue
    definitions.push(entry.definition)
    tokens += cost
  }
  return { definitions, tokens, omitted: ranked.length - definitions.length }
}
