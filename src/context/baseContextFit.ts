import { truncateTextToTokens } from '../core/batch/contextPacker'
import { isDocumentPath } from '../core/rag/documentSources/indexableSources'
import { L } from '../i18n/modelText'
import { estimateTokens } from '../utils/llm/estimateTokens'
import type { VerbexContextTrace } from '../verbex/types'

import { SEARCH_SOURCE_PRIORITY, bucketOf } from './ContextBuilder'

export type FitMode = 'full' | 'catalog' | 'off'
export type FitFacts = {
  fromTokens: number
  toTokens: number
  removedItems: number
  truncatedItems: number
  catalogCandidateLimit?: number
}

export function fitAgentContext(input: {
  trace: VerbexContextTrace
  mode: FitMode
  targetTokens: number
  render: (
    trace: VerbexContextTrace,
    options: { catalogCandidateLimit: number },
  ) => string
  catalogCandidateLimit: number
}): { text: string; trace: VerbexContextTrace; facts: FitFacts } | null {
  if (input.targetTokens <= 0) return null
  const trace = {
    ...input.trace,
    items: input.trace.items.map((item) => ({ ...item })),
  }
  let limit = Math.max(0, Math.floor(input.catalogCandidateLimit))
  const render = () => input.render(trace, { catalogCandidateLimit: limit })
  let text = render()
  const facts: FitFacts = {
    fromTokens: estimateTokens(text),
    toTokens: 0,
    removedItems: 0,
    truncatedItems: 0,
  }
  const result = () => {
    facts.toTokens = estimateTokens(text)
    if (input.mode === 'catalog') facts.catalogCandidateLimit = limit
    return { text, trace, facts }
  }
  if (facts.fromTokens <= input.targetTokens) return result()

  if (input.mode === 'full') {
    const removable = trace.items
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          item.included_in_context && bucketOf(item.source) !== 'current',
      )
      .sort((a, b) => {
        const aSearch = bucketOf(a.item.source) === 'search'
        const bSearch = bucketOf(b.item.source) === 'search'
        if (aSearch !== bSearch) return aSearch ? -1 : 1
        if (aSearch) {
          const priority =
            SEARCH_SOURCE_PRIORITY[b.item.source] -
            SEARCH_SOURCE_PRIORITY[a.item.source]
          if (priority) return priority
          const aScore = a.item.score ?? -Infinity
          const bScore = b.item.score ?? -Infinity
          if (aScore !== bScore) return aScore < bScore ? -1 : 1
        }
        return b.index - a.index
      })
    for (const { index } of removable) {
      trace.items[index] = {
        ...trace.items[index],
        included_in_context: false,
        exclusionReason: 'final_fit',
      }
      facts.removedItems++
      text = render()
      if (estimateTokens(text) <= input.targetTokens) return result()
    }
  } else if (input.mode === 'catalog') {
    // Find the smallest limit that renders the same candidates (budget and
    // duplicate paths can make the configured limit larger than the list).
    let low = 0
    let high = Math.min(limit, trace.items.length)
    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      if (input.render(trace, { catalogCandidateLimit: mid }) === text)
        high = mid
      else low = mid + 1
    }
    limit = low
    while (limit > 0) {
      limit--
      text = render()
      if (estimateTokens(text) <= input.targetTokens) return result()
    }
  }

  const sources =
    input.mode === 'off' ? ['mentioned'] : ['current_note', 'mentioned']
  for (const source of sources) {
    for (let index = trace.items.length - 1; index >= 0; index--) {
      const item = trace.items[index]
      if (!item.included_in_context || item.source !== source) continue
      const marker = isDocumentPath(item.path)
        ? L({
            ko: '[예산 때문에 제공된 발췌의 일부만 실었습니다.]',
            en: `[Only part of the supplied excerpt was included due to the budget.]`,
          })
        : L({
            ko: '[예산 때문에 이 자료의 앞부분만 실었습니다. 나머지가 필요하면 경로로 직접 읽으세요.]',
            en: `[Only the beginning of this material was included due to the budget. Read the rest by path if needed.]`,
          })
      const setSnippet = (k: number) => {
        const prefix = truncateTextToTokens(item.snippet, k)
        trace.items[index] = {
          ...item,
          snippet: `${prefix}${prefix ? '\n' : ''}${marker}`,
          truncatedForFit: true,
        }
        return render()
      }
      facts.truncatedItems++
      let low = 0
      let high = estimateTokens(item.snippet)
      let best: string | null = null
      let bestK = 0
      while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        const candidate = setSnippet(mid)
        if (estimateTokens(candidate) <= input.targetTokens) {
          best = candidate
          bestK = mid
          low = mid + 1
        } else high = mid - 1
      }
      text = best === null ? setSnippet(0) : setSnippet(bestK)
      if (best !== null) return result()
    }
  }
  return null
}
