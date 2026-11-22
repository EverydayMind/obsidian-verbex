import { L } from '../../i18n/modelText'
import type { RequestTool } from '../../types/llm/request'
import type { ToolCallRequest } from '../../types/tool-call.types'

import { parseToolArgs } from './parseToolArgs'
import { CANONICAL_TOOL_MAP, getToolCatalog } from './toolDefinitions'

export function normalizeLocalToolCall(
  call: ToolCallRequest,
  providerHasTool: (name: string) => boolean,
): ToolCallRequest {
  const name = CANONICAL_TOOL_MAP[call.name] ?? call.name
  let args = call.arguments
  if (
    name !== call.name ||
    (!providerHasTool(name) &&
      getToolCatalog().registry[name]?.definition?.function.parameters
        .properties.index_folder)
  ) {
    const parsed = parseToolArgs(args)
    if (parsed.wiki_folder !== undefined) {
      parsed.index_folder = parsed.wiki_folder
      delete parsed.wiki_folder
    }
    args = JSON.stringify(parsed)
  }
  return { ...call, name, arguments: args }
}

function normalized(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    previous = current
  }
  return previous[b.length]
}

function suggestion(key: string, valid: string[]): string | undefined {
  const value = normalized(key)
  if (!value) return undefined
  const prefixes = valid.filter((name) => {
    const candidate = normalized(name)
    return candidate.length >= 3 && value.startsWith(candidate)
  })
  if (prefixes.length === 1) return prefixes[0]
  if (prefixes.length > 1) return undefined
  const scored = valid
    .map((name) => {
      const candidate = normalized(name)
      const limit = candidate.length >= 6 ? 2 : 1
      return {
        name,
        score:
          Math.abs(candidate.length - value.length) <= limit &&
          value.length <= 64
            ? distance(value, candidate)
            : Infinity,
        limit,
      }
    })
    .filter(({ score, limit }) => score <= limit)
    .sort((a, b) => a.score - b.score)
  return scored.length && scored[0].score !== scored[1]?.score
    ? scored[0].name
    : undefined
}

export function unknownToolArgs(
  name: string,
  args: Record<string, unknown>,
  definition?: RequestTool,
): string | undefined {
  const schema = definition?.function.parameters
  if (!schema || schema.additionalProperties === true) return undefined
  const valid = Object.keys(schema.properties)
  const unknown = Object.keys(args).filter(
    (key) => !Object.prototype.hasOwnProperty.call(schema.properties, key),
  )
  if (!unknown.length) return undefined
  const hints = unknown.flatMap((key) => {
    const candidate = suggestion(key, valid)
    return candidate ? [`${JSON.stringify(key)} → ${candidate}`] : []
  })
  const searchHint =
    name === 'search_vault' &&
    unknown.some((key) =>
      ['where', 'group_by', 'group_date', 'sort_by', 'text', 'fields'].includes(
        key,
      ),
    )
  const folderHint = name === 'iterative_search' && unknown.includes('folder')
  return L({
    ko: `${name}: 모르는 인자 ${unknown.map((key) => JSON.stringify(key)).join(', ')}. 유효한 인자: ${valid.join(', ') || '(없음)'}.${hints.length ? ` 후보: ${hints.join(', ')}. 해당 이름을 뜻했다면 다시 호출하세요.` : ''}${searchHint ? ' 속성·날짜 조건, 폴더 범위, 개수·묶음 세기, 본문 낱말 수는 query_notes를 호출하세요.' : ''}${folderHint ? ' 폴더 한정은 search_vault를 호출하세요.' : ''}`,
    en: `${name}: unknown arguments ${unknown.map((key) => JSON.stringify(key)).join(', ')}. Valid arguments: ${valid.join(', ') || '(none)'}.${hints.length ? ` Suggestions: ${hints.join(', ')}. Call again if you meant one of these names.` : ''}${searchHint ? ' Use query_notes for property or date filters, folder scope, counts, grouping, or body word counts.' : ''}${folderHint ? ' Use search_vault for folder-scoped search.' : ''}`,
  })
}
