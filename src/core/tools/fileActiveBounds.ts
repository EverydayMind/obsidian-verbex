import { estimateTokens } from '../../utils/llm/estimateTokens'

const MAX_ACTIVE_FRONTMATTER_CHARS = 8_000
const MAX_ACTIVE_CONTENT_CHARS = 40_000

export function boundActiveContent(
  content: string,
  contextBudget: number,
): { text: string; truncated: boolean } {
  const candidate = content.slice(0, MAX_ACTIVE_CONTENT_CHARS)
  const maxTokens = Math.max(1_000, Math.floor(contextBudget * 0.25))
  if (estimateTokens(candidate) <= maxTokens) {
    return { text: candidate, truncated: candidate.length < content.length }
  }
  let low = 0
  let high = candidate.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (estimateTokens(candidate.slice(0, middle)) <= maxTokens) low = middle
    else high = middle - 1
  }
  return { text: candidate.slice(0, low), truncated: true }
}

export function boundFrontmatter(value: Record<string, unknown>): {
  value: Record<string, unknown>
  truncated: boolean
} {
  if (JSON.stringify(value).length <= MAX_ACTIVE_FRONTMATTER_CHARS)
    return { value, truncated: false }
  const bounded: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    const candidate = { ...bounded, [key]: item }
    if (JSON.stringify(candidate).length > MAX_ACTIVE_FRONTMATTER_CHARS) break
    bounded[key] = item
  }
  return { value: bounded, truncated: true }
}
