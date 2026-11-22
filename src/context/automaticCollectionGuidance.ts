import { L } from '../i18n/modelText'
import type { VerbexContextTrace } from '../verbex/types'

export function automaticCollectionGuidance(
  context: VerbexContextTrace,
  exposedToolNames?: ReadonlySet<string>,
): string {
  const automaticSources: VerbexContextTrace['items'][number]['source'][] = [
    'wiki',
    'bm25',
    'semantic',
    'wikilink',
    'backlink',
    'tag',
  ]
  const automatic = context.items.filter(
    (item) =>
      item.included_in_context && automaticSources.includes(item.source),
  )
  if (!automatic.length) return ''
  const documentCount = new Set(automatic.map((item) => item.path)).size
  const ending = exposedToolNames?.has('obsidian_query')
    ? L({
        ko: '여러 노트에서 어떤 낱말·주제의 언급·발언을 빠짐없이 모아야 하는 요청이면, 이 자료의 후보를 읽기 전에 obsidian_query lines: true로 먼저 전수 수집하세요(노트 조건은 query, 낱말은 query 본문어나 line_terms). 그 밖에 범위를 넓혀야 하면 search_vault·iterative_search를 쓰세요.',
        en: 'For requests to collect every mention or remark of a term or topic across notes, first collect them exhaustively with obsidian_query lines: true before reading these candidates (note conditions in query, terms as query body words or line_terms). To broaden the scope otherwise, use search_vault and iterative_search.',
      })
    : L({
        ko: '여러 문서에서 빠짐없이 모아야 하는 요청이면 search_vault·iterative_search로 범위를 넓히세요.',
        en: 'For requests to collect comprehensively across documents, broaden the scope with search_vault and iterative_search.',
      })
  return L({
    ko: `- 위 자료는 관련도와 예산으로 고른 일부 자료입니다(자동 탐색 항목 ${automatic.length}개, 문서 ${documentCount}개). 조건에 맞는 문서를 전수 수집한 결과가 아닙니다. ${ending}`,
    en: `- The material above is a selection based on relevance and budget (${automatic.length} automatic retrieval items, ${documentCount} documents). It is not an exhaustive collection of matching documents. ${ending}`,
  })
}
