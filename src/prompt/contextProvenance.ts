import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'
import type { VerbexContextTraceItem } from '../verbex/types'

function sourceLabels(
  locale: ModelLocale = getModelLocale(),
): Record<VerbexContextTraceItem['source'], string> {
  return L(
    {
      ko: {
        mentioned: '첨부',
        current_note: '현재 노트',
        wiki: '요약 위키',
        bm25: '키워드 검색',
        semantic: '의미 검색',
        wikilink: '링크 연결',
        backlink: '백링크',
        tag: '공유 태그',
        dataview: 'Dataview',
        base: 'Base',
      },
      en: {
        mentioned: 'Attachment',
        current_note: 'Current note',
        wiki: 'Summary wiki',
        bm25: 'Keyword search',
        semantic: 'Semantic search',
        wikilink: 'Linked note',
        backlink: 'Backlink',
        tag: 'Shared tags',
        dataview: 'Dataview',
        base: 'Base',
      },
    },
    locale,
  )
}

/**
 * Per-item provenance line: where the item came from and, when available, its
 * relevance signal. This lets the model separate signal from noise — e.g. a
 * `의미 검색` hit at 0.88 vs. a `공유 태그` relative the query never mentioned —
 * instead of treating every snippet as equally relevant.
 */
export function provenance(item: VerbexContextTraceItem): string {
  const label = sourceLabels()[item.source] ?? item.source
  if (typeof item.score !== 'number') {
    return label
  }
  if (item.source === 'semantic') {
    return L({
      ko: `${label}, 유사도 ${item.score.toFixed(2)}`,
      en: `${label}, similarity ${item.score.toFixed(2)}`,
    })
  }
  if (item.source === 'tag') {
    return L({ ko: `${label} ${item.score}개`, en: `${label} ${item.score}` })
  }
  return L({
    ko: `${label}, 관련도 ${item.score.toFixed(2)}`,
    en: `${label}, relevance ${item.score.toFixed(2)}`,
  })
}
