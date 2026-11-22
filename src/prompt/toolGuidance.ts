import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'

/**
 * Guidance naming a tool outside the always-exposed core set. It reaches the
 * model only when that tool is in the request, so the prompt never points at
 * a tool the model cannot call.
 */
function toolGuidanceEntries(
  locale: ModelLocale,
): { tool: string; text?: string; simple?: string }[] {
  return [
    {
      tool: 'obsidian_query',
      text: L(
        {
          ko: '- 여러 노트에 흩어진 한 낱말·주제의 언급·발언을 빠짐없이 모으는 요청(예: 회의록에서 어떤 주제에 대한 발언을 모두)은 원문을 읽기 전에 obsidian_query lines: true로 먼저 모읍니다. 자동으로 실린 관련 자료는 점수로 고른 일부이므로 후보가 이미 보여도 이 순서를 지키고, 줄 결과의 노트 경로·날짜를 보고 맥락이 더 필요한 노트만 읽습니다.',
          en: '- For requests to collect every mention or remark of a term or topic scattered across notes (e.g. all remarks on a topic in meeting notes), first collect them with obsidian_query lines: true before reading originals. Automatically included material is a score-based subset, so keep this order even when candidates are already shown; use the note path and date in the line results and read only notes that still need surrounding context.',
        },
        locale,
      ),
    },
    {
      tool: 'audit_links',
      text: L(
        {
          ko: '- 깨진 링크와 들어오는 링크가 없는 노트는 audit_links로 전수 확인합니다.',
          en: '- Use audit_links to check all broken links and notes with no incoming links.',
        },
        locale,
      ),
    },
    {
      tool: 'query_notes',
      text: L(
        {
          ko: '- 노트 개수, 값별·폴더별·월별 분포, 정렬, 기간 조건은 목록을 받아 직접 세지 않고 query_notes를 호출해 그 수를 그대로 씁니다.',
          en: '- For note counts, distributions by value/folder/month, sorting, and date ranges, call query_notes and use its counts directly instead of counting a returned list.',
        },
        locale,
      ),
    },
    {
      tool: 'list_tasks',
      text: L(
        {
          ko: '- 체크박스 할 일은 노트를 하나씩 읽지 않고 list_tasks로 모읍니다.',
          en: '- Collect checkbox tasks with list_tasks instead of reading notes one by one.',
        },
        locale,
      ),
    },
    {
      tool: 'calculate',
      text: L(
        {
          ko: '- 수 셋 이상의 합·평균, 비율·증감률은 암산하지 않고 calculate 결과를 씁니다.',
          en: '- Use calculate for sums or averages of three or more numbers, ratios, and rates of change instead of mental arithmetic.',
        },
        locale,
      ),
    },
    {
      tool: 'date_calc',
      text: L(
        {
          ko: '- 날짜 차이·요일·근무일은 date_calc 결과를 씁니다.',
          en: '- Use date_calc results for date differences, weekdays, and working days.',
        },
        locale,
      ),
    },
    {
      tool: 'delete_file',
      text: L(
        {
          ko: '- delete_file은 파일을 휴지통으로 이동하며 매번 승인을 받습니다.',
          en: '- delete_file moves files to trash and requires approval every time.',
        },
        locale,
      ),
    },
    {
      tool: 'move_file',
      text: L(
        {
          ko: '- move_file은 파일을 다른 폴더로 이동하고 Obsidian 링크를 갱신합니다.',
          en: '- move_file moves a file to another folder and updates Obsidian links.',
        },
        locale,
      ),
    },
    {
      tool: 'rename_file',
      text: L(
        {
          ko: '- rename_file은 같은 폴더에서 이름을 바꾸고 Obsidian 링크를 갱신합니다.',
          en: '- rename_file renames a file within its folder and updates Obsidian links.',
        },
        locale,
      ),
    },
    {
      tool: 'restore_last_change',
      text: L(
        {
          ko: '- 노트·볼트 파일에 적용된 최근 변경을 되돌릴 때 restore_last_change를 호출합니다. 복원 대상은 호스트가 정하고 사용자가 승인합니다. 열린 문서 편집기의 편집은 그 편집기의 되돌리기 도구로 되돌립니다.',
          en: '- Call restore_last_change to undo the latest applied change to notes or Vault files. The host selects the target and the user approves. Undo edits in an open document editor with that editor’s undo tool.',
        },
        locale,
      ),
    },
    {
      // The default runtime layer already covers render_base, a core tool there.
      tool: 'render_base',
      simple: L(
        {
          ko: '- 같은 조건의 Base 뷰가 있으면 render_base로 그 뷰를 렌더링해 답합니다.',
          en: '- If a Base view uses the same conditions, render it with render_base to answer.',
        },
        locale,
      ),
    },
    {
      tool: 'find_by_property',
      text: L(
        {
          ko: '- Obsidian Properties/frontmatter의 특정 키-값 목록 질문(예: category=개념들, status=완료, project=무역인증)에는 추측하거나 일반 검색을 먼저 하지 말고 먼저 find_by_property를 호출합니다. 같은 조건의 Base 뷰가 없으면 filter_field·exclude_values로 호스트가 전체 집합을 거르게 합니다.',
          en: '- For lists matching specific Obsidian Properties/frontmatter key-value pairs (for example, category=concepts, status=done, project=trade-cert), call find_by_property first instead of guessing or starting with general search. If no Base view has the same conditions, use filter_field and exclude_values so the host filters the full set.',
        },
        locale,
      ),
      simple: L(
        {
          ko: '- 속성 키-값 목록은 find_by_property를 먼저 호출하고, Base 뷰가 없으면 filter_field·exclude_values로 거릅니다.',
          en: '- For property key-value lists, call find_by_property first; if there is no Base view, filter with filter_field and exclude_values.',
        },
        locale,
      ),
    },
    {
      tool: 'request_tool',
      text: L(
        {
          ko: '- 작업에 꼭 필요한 능력인데 가진 도구로는 할 수 없다면, 혼자 우회하느라 헤매지 말고 request_tool로 필요한 도구의 이름·목적·기존 도구로 부족한 이유·예시를 적어 개발을 요청합니다. 요청은 기록만 되고 즉시 구현되지는 않으니, 그동안은 기존 도구로 가능한 범위까지 진행합니다.',
          en: '- If a required capability is unavailable in your tools, use request_tool to request development with its name, purpose, why existing tools are insufficient, and an example instead of struggling with workarounds. Requests are only recorded, not implemented immediately; meanwhile proceed as far as existing tools allow.',
        },
        locale,
      ),
    },
  ]
}

export function toolGuidance(
  exposedToolNames: ReadonlySet<string> | undefined,
  simple: boolean,
  locale: ModelLocale = getModelLocale(),
): string {
  const lines = toolGuidanceEntries(locale)
    .filter((entry) => !exposedToolNames || exposedToolNames.has(entry.tool))
    .flatMap(
      (entry) => (simple ? (entry.simple ?? entry.text) : entry.text) ?? [],
    )
  return lines.length
    ? `${L({ ko: '# 도구 선택 안내', en: '# Tool selection guidance' }, locale)}\n${lines.join('\n')}`
    : ''
}
