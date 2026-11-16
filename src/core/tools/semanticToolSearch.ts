import { SemanticSearchProvider } from '../../context/ContextBuilder'
import { L } from '../../i18n/modelText'
import { SemanticQueryOutcome } from '../rag/ragEngine'

import { Candidate } from './contextCandidatesRanking'
import { SemanticFact, ToolArgs, semanticFactText } from './localToolCommon'

export function cleanIterativeClue(
  value: string,
  query: string,
): string | null {
  const cleaned = value
    .replace(/^!/, '')
    .replace(/^\[\[/, '')
    .replace(/\]\]$/, '')
    .split('|')[0]
    .replace(/\.md$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length < 2 || cleaned.length > 80) return null
  if (cleaned.toLowerCase() === query.toLowerCase()) return null
  return cleaned
}

export function boundedPositiveInteger(
  args: ToolArgs,
  key: string,
  fallback: number,
  maximum: number,
): number | null {
  if (args[key] === undefined || args[key] === null) return fallback
  const value = Number(args[key])
  if (!Number.isInteger(value) || value < 1) return null
  return Math.min(value, maximum)
}

export function boundedGraphText(lines: string[], summary: string): string {
  const body = lines.join('\n')
  const candidate = body.length > 0 ? `${body}\n${summary}` : summary
  if (candidate.length <= 40_000) return candidate
  return `${candidate.slice(0, 40_000)}\ntruncated_chars=true`
}

/** Vector hits existed but none survived the engine's final selection. */
export type SemanticCandidateOutcome =
  | SemanticQueryOutcome
  | 'vector_not_selected'

export async function semanticCandidates(
  provider: SemanticSearchProvider,
  query: string,
  onOutcome: (outcome: SemanticCandidateOutcome) => void,
): Promise<Candidate[]> {
  if (!provider.processQueryHits)
    return (await provider.processQuery({ query })).map((result) => ({
      path: result.path,
      score: result.similarity,
      snippet: result.content.replace(/\s+/g, ' ').trim().slice(0, 260),
    }))
  let observed: SemanticQueryOutcome | undefined
  // Same candidates as processQuery (no graph expansion), with per-result
  // origins so only vector hits count as semantic.
  const hits = await provider.processQueryHits({
    query,
    withProvenance: true,
    onSemanticOutcome: (outcome) => {
      observed = outcome
      onOutcome(outcome)
    },
    hitSelection: { expandAdjacent: false },
  })
  const candidates = hits
    .filter((hit) => hit.provenance.includes('vector'))
    .map((hit) => ({
      path: hit.locator.path,
      score: hit.scores.final ?? hit.scores.vector ?? 0,
      snippet: (hit.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 260),
    }))
  if (observed === 'vector' && candidates.length === 0)
    onOutcome('vector_not_selected')
  return candidates
}

export function semanticResultFact(
  fact: SemanticFact | undefined,
  kind: 'context' | 'iterative',
): string[] {
  return fact
    ? [
        L({
          ko: `의미 검색 결과가 이번 호출에 없습니다(${semanticFactText()[fact]}). ${kind === 'context' ? '키워드' : '키워드·링크'} 후보만입니다.`,
          en: `No semantic search results are available for this call (${semanticFactText()[fact]}). Only ${kind === 'context' ? 'keyword' : 'keyword/link'} candidates are included.`,
        }),
      ]
    : []
}
