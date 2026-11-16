import { tokenize } from '../core/rag/bm25'

import type { ContextItem } from './ContextBuilder'

export function gateStructuralLexically(
  items: ContextItem[],
  query: string,
  lexicalPaths: ReadonlySet<string>,
): ContextItem[] {
  const queryTokens = new Set(
    tokenize(query).filter((token) => [...token].length >= 2),
  )
  if (queryTokens.size === 0) return items
  return items.map((item) => {
    if (
      !item.included_in_context ||
      !['wikilink', 'backlink', 'tag'].includes(item.source) ||
      lexicalPaths.has(item.path)
    )
      return item
    const basename = (item.path.split('/').pop() ?? '').replace(/\.[^.]+$/, '')
    const tokens = tokenize(`${basename} ${item.heading ?? ''} ${item.snippet}`)
    return tokens.some(
      (token) => [...token].length >= 2 && queryTokens.has(token),
    )
      ? item
      : { ...item, included_in_context: false, exclusionReason: 'lexical_gate' }
  })
}
