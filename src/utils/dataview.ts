import { App } from 'obsidian'

import { estimateTokens } from './llm/estimateTokens'

export type DataviewAPI = {
  queryMarkdown(
    query: string,
    originFile?: string,
  ): Promise<{ successful: boolean; value: string; error?: string }>
}

export function getDataviewAPI(app: App): DataviewAPI | null {
  const plugins = (
    app as App & { plugins?: { plugins?: Record<string, unknown> } }
  ).plugins
  const dvPlugin = plugins?.plugins?.dataview as
    | { api?: DataviewAPI }
    | undefined
  return dvPlugin?.api ?? null
}

const DATAVIEW_BLOCK_RE = /```dataview\n([\s\S]*?)```/g

export const MAX_DATAVIEW_QUERY_CHARS = 8_000

export type DataviewResultLimit = {
  maxChars: number
  maxTokens?: number
}

export type BoundedDataviewResult = {
  text: string
  truncated: boolean
}

/**
 * Bound rendered Dataview output by both characters and the caller's token
 * budget. The result is intentionally mechanical: callers decide how to label
 * the truncation for their UI/tool surface.
 */
export function boundDataviewResult(
  value: string,
  limit: DataviewResultLimit,
): BoundedDataviewResult {
  const maxChars = Math.max(1, Math.floor(limit.maxChars))
  const candidate = value.slice(0, maxChars)
  const maxTokens =
    typeof limit.maxTokens === 'number' && limit.maxTokens > 0
      ? Math.floor(limit.maxTokens)
      : null
  if (maxTokens === null || estimateTokens(candidate) <= maxTokens) {
    return { text: candidate, truncated: candidate.length < value.length }
  }

  let low = 0
  let high = candidate.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (estimateTokens(candidate.slice(0, middle)) <= maxTokens) low = middle
    else high = middle - 1
  }
  return {
    text: candidate.slice(0, low),
    truncated: true,
  }
}

export async function resolveDataviewBlocks(
  content: string,
  filePath: string,
  app: App,
): Promise<string> {
  const dvApi = getDataviewAPI(app)
  if (!dvApi) return content

  const matches = [...content.matchAll(DATAVIEW_BLOCK_RE)]
  if (matches.length === 0) return content

  let result = content
  for (const match of matches) {
    const query = match[1].trim()
    try {
      const res = await dvApi.queryMarkdown(query, filePath)
      if (res.successful) {
        const replacement =
          `[Dataview Query: ${query}]\n` + (res.value.trim() || '(No results)')
        result = result.replace(match[0], replacement)
      }
    } catch {
      // leave unchanged on error
    }
  }
  return result
}

export async function executeDataviewQuery(
  query: string,
  app: App,
  originFile?: string,
): Promise<string> {
  const result = await executeDataviewQueryResult(query, app, originFile)
  return result.ok ? result.value || '(No results)' : result.message
}

export type DataviewQueryResult =
  | { ok: true; value: string }
  | { ok: false; message: string }

/** Preserve API success/failure separately from potentially identical result text. */
export async function executeDataviewQueryResult(
  query: string,
  app: App,
  originFile?: string,
): Promise<DataviewQueryResult> {
  const dvApi = getDataviewAPI(app)
  if (!dvApi) {
    return {
      ok: false,
      message: '(Dataview plugin not installed or not enabled)',
    }
  }
  try {
    const res = await dvApi.queryMarkdown(query, originFile)
    if (res.successful) {
      return { ok: true, value: res.value.trim() }
    }
    return {
      ok: false,
      message: `(Dataview error: ${res.error ?? 'unknown error'})`,
    }
  } catch (e) {
    return { ok: false, message: `(Dataview execution failed: ${String(e)})` }
  }
}
