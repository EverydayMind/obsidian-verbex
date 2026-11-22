import { isCompactedMessage } from '../../context/compaction'
import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { RequestMessage, RequestTool } from '../../types/llm/request'
import { PromptLevel } from '../../types/prompt-level.types'
import {
  isStructuralExtractionIntent,
  isVerbatimOperationIntent,
  isWholeTransformIntent,
} from '../routing/scopeDecision'

import { ENGLISH_FORMAT_REUSE, ENGLISH_TOOL_ROUTES } from './englishToolRoutes'
import { explicitlyNamedTools } from './explicitToolMentions'
import {
  DELETE_FILE_ROUTE,
  MOVE_FILE_ROUTE,
  RENAME_FILE_ROUTE,
} from './fileOperationRoutes'
import {
  CANONICAL_TOOL_MAP,
  TOOL_REGISTRY,
  getToolCatalog,
} from './toolCatalogRegistry'

export * from './toolCatalogRegistry'
export { tool, pathProp, contentProp } from './toolHelper'

export function getAgentToolDefinitions(
  locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  return getToolCatalog(locale).agent
}
export const AGENT_TOOL_DEFINITIONS = getToolCatalog().agent

export const SIMPLE_CORE_TOOL_NAMES = new Set(
  Object.entries(TOOL_REGISTRY)
    .filter(([_, entry]) => entry.simpleCore)
    .map(([name]) => name),
)

const DEFAULT_AGENT_TOOL_NAMES = new Set([
  ...SIMPLE_CORE_TOOL_NAMES,
  'list_files',
  'note_outline',
  'read_note_section',
  'search_in_file',
  // read_file/find_by_property results point at Base views by this name.
  'render_base',
])

const LEGACY_FORMAT_REUSE_ROUTE =
  /(?=.*(?:hwp|hwpx|한글|보고서|report))(?=.*(?:양식|서식|형식|format|template))(?=.*(?:샘플|예시|참고|기존|재사용|본떠|본따|같은|따라|처럼|reuse|match|(?:^|\s)(?:sample|example|reference|existing)(?=\s|$)))/i

export const FORMAT_REUSE_ROUTE = new RegExp(
  `(?=[\\s\\S]*\\p{Script=Hangul})(?:${LEGACY_FORMAT_REUSE_ROUTE.source})|${ENGLISH_FORMAT_REUSE.source}`,
  'iu',
)

const SIMPLE_TOOL_ROUTES: { pattern: RegExp; names: string[] }[] = [
  ...ENGLISH_TOOL_ROUTES,
  {
    pattern:
      /(?:깨진|끊어진|끊긴|죽은)\s*링크|링크.{0,12}(?:깨|끊|점검|검사)|존재하지\s*않는\s*(?:노트|파일).{0,16}링크|없는\s*노트를\s*가리키|링크되지\s*않은|링크가\s*없는\s*노트|고아\s*노트|\bbroken links?\b|\bunresolved links?\b|\borphan(?:ed)? notes?\b/i,
    names: ['audit_links'],
  },
  {
    pattern:
      /몇\s*(?:개|건|명|번|회|곳|편)|세어|세고|세서|개수|건수|횟수|빈도|집계|(?:노트|회의|메모|보고서|파일|문서)\s*수(?=[를는가도만\s?.]|$)|(?:월|연도|주|폴더|유형|종류|상태|담당자|소속)별|가장\s*(?:많|적|오래|최근|큰|작)|(?:오래된|최근|최신|날짜|많은|적은)\s*순|오름차순|내림차순|정렬|상위\s*\d|하위\s*\d|\d{1,2}\s*[월/]\s*\d{1,2}.{0,12}(?:부터|사이|까지|이후|이전)|\bhow many (?!days)|\bcount\b|\bsort(?:ed)?\b|\boldest\b|\bnewest\b/i,
    names: ['query_notes'],
  },
  {
    pattern:
      /할\s*일|조치\s*사항|(?:미완료|안\s*끝난|체크\s*안\s*된|체크되지\s*않은).{0,12}(?:조치|항목|과제)|체크박스|\btodos?\b|\bopen tasks?\b|\bunchecked\b|\baction items?\b|\bcheckbox(?:es)?\b/i,
    names: ['list_tasks', 'query_notes'],
  },
  {
    pattern:
      /며칠|몇\s*일|무슨\s*요일|요일이|근무일|영업일|D-?day|디데이|\d+\s*일\s*(?:후|뒤|전)|\bhow many days\b|\bweekday\b|\bbusiness days\b/i,
    names: ['date_calc'],
  },
  {
    pattern:
      /계산|합계|총합|누계|평균|비율|비중|증가율|감소율|증감률|퍼센트|\d\s*%|\bcalculate\b|\baverage\b|\bpercent(?:age)?\b|\bratio\b/i,
    names: ['calculate'],
  },
  { pattern: DELETE_FILE_ROUTE, names: ['delete_file'] },
  { pattern: MOVE_FILE_ROUTE, names: ['move_file'] },
  { pattern: RENAME_FILE_ROUTE, names: ['rename_file'] },
  {
    pattern:
      /되돌|원래대로|복원|\b(?:undo|revert|rollback)\b|(?:변경|수정|편집|작업|방금|마지막|직전).{0,20}취소|취소.{0,20}(?:변경|수정|편집|작업)/i,
    names: ['restore_last_change'],
  },
  {
    pattern: FORMAT_REUSE_ROUTE,
    names: [
      'prepare_format_reuse',
      'save_format_decomposition',
      'produce_format_reuse',
    ],
  },
  {
    // Bare 전체/모든 also means "the whole document" ("협정문 전체를 검토").
    pattern:
      /목록|리스트|(?:전체|모든)\s*(?:노트|파일|항목|건)|전수|소속별|분류별|list all|inventory/i,
    names: [
      'find_by_property',
      'export_property_query',
      'list_files',
      'render_base',
    ],
  },
  {
    // Each condition may be Korean or English in a mixed-language request.
    pattern:
      /^(?=[\s\S]*(?:모아|모두|전부|빠짐없이|모든|목록|\b(?:collect|gather|all|every|list)\b))(?=[\s\S]*(?:언급|발언|말한|한\s*말|나오는|나온|들어\s*(?:간|있는|있던)|포함(?:된|하는)|적힌|적혀|쓰인|등장(?:하는|한)|이야기|인용|\b(?:mentions?|mentioned|said|quotes?|occurrences?|appears?|appearing|contains?|containing|includes?|including|written|occur(?:s|ring)?)\b))(?=[\s\S]*(?:회의록|노트|메모|기록|문서|보고서|\b(?:meeting notes|notes|memos|records)\b))/i,
    names: ['obsidian_query'],
  },
  {
    // "category가 과제들인 노트", "진행단계가 완료가 아닌 건", 미완료 과제
    pattern:
      /(?:\b[a-z_][a-z0-9_-]*\s*(?:가|이|은|는|=|:)\s*\S+?\s*(?:인|이\s*아닌|가\s*아닌)|[가-힣]{2,}\s*(?:가|이|은|는|=|:)\s*\S+?\s*(?:인|이\s*아닌|가\s*아닌)\s*(?:[가-힣a-z]{2,}|것|건))|category|카테고리|진행\s*단계|status|미완료|미결|안\s*끝난/iu,
    names: ['find_by_property', 'render_base', 'read_frontmatter'],
  },
  {
    pattern: /협정|조약|체크리스트|검토.*색인|treaty|checklist|review.index/i,
    names: [
      'build_review_index',
      'checklist_next',
      'submit_finding',
      'audit_index',
      'compile_report',
    ],
  },
  {
    pattern: /속성|프로퍼티|frontmatter|property|metadata|메타데이터/i,
    names: [
      'read_frontmatter',
      'find_by_property',
      'query_notes',
      'obsidian_query',
      'render_base',
    ],
  },
  {
    pattern:
      /(?=.*(속성|프로퍼티|frontmatter|property|metadata|메타데이터))(?=.*(변경|수정|추가|삭제|갱신|set|remove|update|edit|write))/i,
    names: ['update_frontmatter'],
  },
  {
    // Bare 그래프/경로 also mean charts ("막대 그래프") and file paths.
    pattern:
      /링크|백링크|관계|연결\s*(?:경로|구조|관계)|그래프\s*(?:뷰|구조|관계|분석)|link|backlink|graph\s*(?:view|path|analysis)|note\s*graph/i,
    names: ['note_context', 'vault_graph', 'graph_path', 'parse_links'],
  },
  {
    pattern:
      /고아|중심\s*노드|동시\s*출현|통계|statistics|orphan|centrality|co-occurrence/i,
    names: ['graph_stats'],
  },
  {
    pattern: /폴더|파일 목록|노트 목록|folder|list files|list notes/i,
    names: ['list_files', 'read_folder', 'folder_tree'],
  },
  {
    pattern: /태그|tag/i,
    names: ['list_tags', 'find_by_tag', 'query_notes'],
  },
  // iterative_search (always exposed) already fuses BM25, embeddings and links;
  // add the narrower searches only when the request asks for that kind.
  {
    pattern: /조사|리서치|근거|자료|research/i,
    names: ['iterative_search'],
  },
  {
    pattern: /의미\s*검색|유사|semantic|similar/i,
    names: ['semantic_search'],
  },
  {
    pattern:
      /문맥\s*(?:트리|포리스트|지도)|context\s*(?:tree|forest)|search_context_tree/i,
    names: ['search_context_tree'],
  },
  {
    pattern:
      /dataview|dql|데이터뷰|\bbases?\b|\.base|(?<!데이터)베이스|렌더|\brender\b/i,
    names: ['render_base', 'render_dataview', 'dataview_query'],
  },
  {
    pattern: /섹션|절|주변 줄|section|heading/i,
    names: ['read_note_section', 'read_note_around'],
  },
  {
    pattern:
      /(?=.*(섹션|절|section|heading))(?=.*(추가|삽입|수정|교체|대체|삭제|append|prepend|replace|patch|edit|update))/i,
    names: ['patch_section'],
  },
  {
    pattern:
      /조문|article|제\s*\d+\s*조|패턴|정규식|regex|매치|파일\s*내\s*검색|\bpattern\b|\bsearch in (?:a |the )?file\b/i,
    names: ['search_in_file', 'note_outline_by_pattern'],
  },
  {
    pattern:
      /열려\s*있|현재\s*노트|active\s*note|보고\s*있는|\bcurrent note\b|\bopen note\b/i,
    names: ['active_note'],
  },
  {
    pattern:
      /복사|복제|템플릿|병합|합치|합쳐|하나로\s*합|이어붙|copy|clone|template|combine|concatenate/i,
    names: ['copy_file', 'combine_files'],
  },
]

export function isStructuralFileExtractionRequest(request: string): boolean {
  return isStructuralExtractionIntent(request)
}

export function isChapterFileSplitRequest(request: string): boolean {
  return (
    /(?:챕터|장).{0,32}(?:별로)?.{0,24}(?:분할|쪼개|나누|나눠|분리).{0,32}(?:저장|파일|노트|폴더)|(?:분할|쪼개|나누|나눠|분리).{0,32}(?:챕터|장)/i.test(
      request,
    ) ||
    /\b(?:split|separate|divide)\b.{0,32}\b(?:by|into)\b.{0,16}\bchapters?\b|\bchapters?\b.{0,32}\b(?:split|separate|divide|files?)\b/i.test(
      request,
    )
  )
}

export function isWholeFileTransformRequest(request: string): boolean {
  return isWholeTransformIntent(request)
}

export function isVerbatimFileOperationRequest(request: string): boolean {
  return isVerbatimOperationIntent(request)
}

export function selectAgentToolDefinitions(
  request: string,
  promptLevel: PromptLevel = PromptLevel.Default,
  activeSkills: { tools?: string[] }[] = [],
  scopeDecision?: { coverage?: string; operation?: string; reason?: string },
  locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  const selected = new Set(
    promptLevel === PromptLevel.Simple
      ? SIMPLE_CORE_TOOL_NAMES
      : DEFAULT_AGENT_TOOL_NAMES,
  )
  // Korean grammar (including mixed-language requests) retains its old behavior.
  // Pure English uses bounded English words, so e.g. "staging" is not a tag.
  const routes = /\p{Script=Hangul}/u.test(request)
    ? SIMPLE_TOOL_ROUTES
    : ENGLISH_TOOL_ROUTES
  for (const route of routes) {
    if (route.pattern.test(request)) {
      route.names.forEach((name) => selected.add(name))
    }
  }
  explicitlyNamedTools(request).forEach((name) => selected.add(name))
  for (const skill of activeSkills) {
    for (const name of skill.tools ?? [])
      selected.add(CANONICAL_TOOL_MAP[name] ?? name)
  }

  const isVerbatim = scopeDecision
    ? scopeDecision.operation === 'transform'
    : isVerbatimFileOperationRequest(request)

  if (isVerbatim) {
    selected.add('extract_to_file')
    selected.add('transform_large_file')
    const isChapter = scopeDecision
      ? scopeDecision.reason?.includes('chapter') ||
        isChapterFileSplitRequest(request)
      : isChapterFileSplitRequest(request)
    if (isChapter) {
      selected.add('split_file_by_chapters')
    }
  }

  return getAgentToolDefinitions(locale).filter((definition) =>
    selected.has(definition.function.name),
  )
}

export function agentToolRoutingText(
  request: string,
  messages: readonly RequestMessage[],
): string {
  const intent = messages
    .filter(
      (message): message is Extract<RequestMessage, { role: 'assistant' }> =>
        message.role === 'assistant' && !isCompactedMessage(message),
    )
    .map((message) => message.content)
    .filter((text) => text.trim().length > 0)
  return [request, ...intent].join('\n')
}
