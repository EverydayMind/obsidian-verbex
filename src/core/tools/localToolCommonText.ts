import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

import type { SemanticFact } from './localToolCommon'

export const DATAVIEW_BLOCK_RE = /(^|\n)[ \t]*`{3,}[ \t]*dataview(js)?\b/i
export const BASE_BLOCK_RE = /(^|\n)[ \t]*`{3,}[ \t]*base\b/i
export const BASE_FILE_EMBED_RE =
  /!\[\[[^\]]+?\.base(?:#[^\]|]+)?(?:\|[^\]]*)?\]\]/i

export function semanticFactText(
  locale?: ModelLocale,
): Record<SemanticFact, string> {
  return L(
    {
      ko: {
        not_started: '준비를 예약했습니다',
        initializing: '준비 중입니다',
        model_unset: '임베딩 모델이 설정되지 않았습니다',
        index_not_ready: '임베딩 색인이 준비되지 않았습니다',
        cooling_down: '최근 실패로 잠시 쉬는 중입니다',
        embedding_failed: '질의 임베딩에 실패했습니다',
        deadline: '벡터 검색 시간이 초과되었습니다',
        no_vector_hits: '의미가 가까운 후보가 없었습니다',
        vector_not_selected: '의미 후보가 결과 상위에 들지 않았습니다',
      },
      en: {
        not_started: 'Preparation has been scheduled',
        initializing: 'Preparation is in progress',
        model_unset: 'No embedding model is configured',
        index_not_ready: 'The embedding index is not ready',
        cooling_down: 'Temporarily cooling down after a recent failure',
        embedding_failed: 'Query embedding failed',
        deadline: 'Vector search timed out',
        no_vector_hits: 'No semantically similar candidates were found',
        vector_not_selected:
          'Semantic candidates did not rank among the top results',
      },
    },
    locale,
  )
}

export function isBasePath(path: string): boolean {
  return path.toLowerCase().endsWith('.base')
}

export function renderOfferHint(path: string, content: string): string {
  const base = isBasePath(path)
  const embeddedBase =
    !base && (BASE_BLOCK_RE.test(content) || BASE_FILE_EMBED_RE.test(content))
  const dataview = !base && DATAVIEW_BLOCK_RE.test(content)
  if (!base && !embeddedBase && !dataview) return ''
  const kind = L({
    ko: base
      ? 'Obsidian Base(.base) 정의'
      : embeddedBase
        ? '임베드된 Obsidian Base'
        : 'Dataview 쿼리 블록',
    en: base
      ? 'an Obsidian Base (.base) definition'
      : embeddedBase
        ? 'an embedded Obsidian Base'
        : 'a Dataview query block',
  })
  return L({
    ko:
      `\n\n---\n[렌더링 안내] 이 파일에는 ${kind}가 들어 있어, 위 원본 텍스트만으로는 ` +
      'Obsidian이 실제로 보여주는 렌더링 결과(생성되는 표·목록)를 알 수 없습니다. ' +
      '현재 요청에 그 표·목록이 필요하면 사용자에게 묻지 말고 바로 Base는 render_base, Dataview는 render_dataview 도구로 ' +
      '렌더링해 사용하세요. 요청과 무관하면 렌더링하지 말고 그대로 진행하세요. Dataview 플러그인이 비활성이면 render_dataview가 ' +
      '그 사실을 알려주며, 그때는 "꺼져 있어 렌더링을 skip합니다"라고 안내하고 자연스럽게 ' +
      '다음으로 넘어가세요.',
    en: `\n\n---\n[Rendering guidance] This file contains ${kind}, so the source text above does not reveal what Obsidian actually renders (generated tables and lists). If the current request needs those tables or lists, render them immediately with render_base for Base or render_dataview for Dataview, without asking the user. If unrelated to the request, proceed without rendering. If the Dataview plugin is disabled, render_dataview will report that fact; then explain that rendering is skipped because it is disabled and continue naturally.`,
  })
}
