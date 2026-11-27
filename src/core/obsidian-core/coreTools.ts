import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import type { RequestTool } from '../../types/llm/request'
import { tool } from '../tools/toolHelper'
import type { ToolRegistryEntry } from '../tools/toolRegistryEntry'

export const OPEN_OBSIDIAN_TARGETS = [
  'graph',
  'local_graph',
  'search',
  'backlinks',
  'outline',
  'tags',
  'bookmarks',
  'note',
] as const

export type OpenObsidianTarget = (typeof OPEN_OBSIDIAN_TARGETS)[number]

export const CORE_TOOL_NAMES = [
  'daily_note',
  'create_from_template',
  'list_bookmarks',
  'open_in_obsidian',
  'read_canvas',
  'edit_canvas',
] as const

const NAMES = new Set<string>(CORE_TOOL_NAMES)
export const isCoreTool = (name: string): boolean => NAMES.has(name)

export function getCoreToolDefinitions(
  locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  return [
    tool(
      'daily_note',
      L(
        {
          ko: 'Obsidian 일일노트(Daily notes) 설정(폴더·형식·템플릿)으로 일일노트를 읽거나 기간 목록을 조회하거나, 템플릿으로 새 일일노트를 만들거나 줄을 추가하는 변경을 제안합니다. 일일노트 경로를 추측하지 말고 이 도구를 씁니다.',
          en: 'Read a daily note, list daily notes across a date range, or propose creating/updating a daily note using Obsidian Daily notes settings (folder, format, template). Use this instead of guessing daily note paths.',
        },
        locale,
      ),
      {
        date: {
          type: 'string',
          description: L(
            {
              ko: '대상 날짜: YYYY-MM-DD 또는 today, yesterday, tomorrow. 기본값 today.',
              en: 'Target date: YYYY-MM-DD, today, yesterday, or tomorrow. Default today.',
            },
            locale,
          ),
        },
        end_date: {
          type: 'string',
          description: L(
            {
              ko: '기간 조회 종료 날짜(선택, 최대 93일). 있는 노트 경로 목록과 없는 날짜 수를 반환합니다.',
              en: 'Optional range end date (max 93 days). Returns existing note paths and missing day count.',
            },
            locale,
          ),
        },
        create: {
          type: 'boolean',
          description: L(
            {
              ko: 'true면 일일노트가 없을 때 템플릿으로 만들기 변경을 제안하고, 이미 있고 add_lines가 있으면 수정 변경을 제안합니다.',
              en: 'When true, propose creating the daily note from its template if missing, or modifying it with add_lines if it exists.',
            },
            locale,
          ),
        },
        add_lines: {
          type: 'array',
          items: { type: 'string' },
          description: L(
            {
              ko: '일일노트에 넣을 줄 목록(선택).',
              en: 'Optional lines to insert into the daily note.',
            },
            locale,
          ),
        },
        under_heading: {
          type: 'string',
          description: L(
            {
              ko: 'add_lines를 넣을 Markdown 제목(선택). 없으면 할 일 줄은 노트의 첫 빈 할 일 자리에, 그 밖은 노트 끝에 넣습니다.',
              en: 'Optional Markdown heading under which to insert add_lines. When omitted, task lines fill the first empty task placeholder in the note; other lines go at the end.',
            },
            locale,
          ),
        },
      },
    ),
    tool(
      'create_from_template',
      L(
        {
          ko: 'Obsidian 템플릿(Templates) 설정의 템플릿 목록을 조회하거나, 지정한 템플릿의 날짜·시각·제목 토큰을 치환해 새 노트를 만드는 변경을 제안합니다. 템플릿을 직접 읽어 흉내 내지 말고 이 도구를 씁니다. 이미 있는 경로는 덮어쓰지 않습니다.',
          en: 'List templates in the Obsidian Templates folder or propose creating a new note from a template with date, time, and title tokens substituted. Use this instead of manually imitating a template. Never overwrites an existing path.',
        },
        locale,
      ),
      {
        template: {
          type: 'string',
          description: L(
            {
              ko: '템플릿 이름 또는 경로. 생략하면 템플릿 폴더의 목록과 절 구조를 반환합니다.',
              en: 'Template name or path. Omit to list templates and their sections.',
            },
            locale,
          ),
        },
        path: {
          type: 'string',
          description: L(
            {
              ko: '만들 새 노트의 정확한 볼트 상대 경로(path 또는 title+folder 사용).',
              en: 'Exact vault-relative path for the new note (provide path or both title and folder).',
            },
            locale,
          ),
        },
        title: {
          type: 'string',
          description: L(
            {
              ko: '새 노트 제목(.md 제외). folder와 함께 사용합니다.',
              en: 'New note title without .md. Requires folder.',
            },
            locale,
          ),
        },
        folder: {
          type: 'string',
          description: L(
            {
              ko: 'title로 만들 때의 대상 폴더(빈 문자열이면 볼트 최상위).',
              en: 'Destination folder when using title (empty string for vault root).',
            },
            locale,
          ),
        },
        date: {
          type: 'string',
          description: L(
            {
              ko: '토큰 치환 기준 날짜 YYYY-MM-DD(선택, 기본 오늘).',
              en: 'Reference date YYYY-MM-DD for token substitution (optional, default today).',
            },
            locale,
          ),
        },
        time: {
          type: 'string',
          description: L(
            {
              ko: '토큰 치환 기준 시각 HH:mm(선택, 기본 지금).',
              en: 'Reference time HH:mm for token substitution (optional, default now).',
            },
            locale,
          ),
        },
        add_lines: {
          type: 'array',
          items: { type: 'string' },
          description: L(
            {
              ko: '새 노트에 추가로 넣을 줄 목록(선택).',
              en: 'Optional extra lines to insert into the new note.',
            },
            locale,
          ),
        },
        under_heading: {
          type: 'string',
          description: L(
            {
              ko: 'add_lines를 넣을 Markdown 제목(선택). 없으면 할 일 줄은 첫 빈 할 일 자리에, 그 밖은 끝에 넣습니다.',
              en: 'Optional Markdown heading under which to insert add_lines. When omitted, task lines fill the first empty task placeholder; other lines go at the end.',
            },
            locale,
          ),
        },
      },
    ),
    tool(
      'list_bookmarks',
      L(
        {
          ko: 'Obsidian 북마크(Bookmarks) 목록과 묶음 구조를 조회합니다. 항목 종류·제목·경로·존재 여부·검색식·URL만 반환하며 노트 본문은 읽지 않습니다(내용은 read_files로 읽으세요).',
          en: 'List Obsidian bookmarks and bookmark groups with type, title, path, existence, query, or URL. Does not read note contents (use read_files to read them).',
        },
        locale,
      ),
      {},
    ),
    tool(
      'open_in_obsidian',
      L(
        {
          ko: 'Obsidian 화면(그래프·로컬 그래프·검색·백링크·개요·태그·북마크·노트)을 엽니다. 사용자가 화면을 열어 달라고 분명히 요청했을 때만 사용합니다. 파일을 바꾸지 않습니다.',
          en: 'Open an Obsidian view (graph, local_graph, search, backlinks, outline, tags, bookmarks, or note). Use only when the user explicitly asks to open a view or note. Does not modify any files.',
        },
        locale,
      ),
      {
        target: {
          type: 'string',
          enum: [...OPEN_OBSIDIAN_TARGETS],
          description: L(
            {
              ko: '열 화면 대상: graph, local_graph, search, backlinks, outline, tags, bookmarks, note.',
              en: 'View target to open: graph, local_graph, search, backlinks, outline, tags, bookmarks, or note.',
            },
            locale,
          ),
        },
        path: {
          type: 'string',
          description: L(
            {
              ko: 'local_graph·backlinks·outline·note 대상에 사용할 정확한 노트 경로(생략하면 활성 노트).',
              en: 'Exact note path for local_graph, backlinks, outline, or note (defaults to active note).',
            },
            locale,
          ),
        },
        query: {
          type: 'string',
          description: L(
            {
              ko: 'target이 search일 때 검색 창에 넣을 검색식(선택).',
              en: 'Optional search query when target is search.',
            },
            locale,
          ),
        },
      },
      ['target'],
    ),
    tool(
      'read_canvas',
      L(
        {
          ko: 'Obsidian 캔버스(.canvas) 파일의 구조(노드 종류별 수, 그룹 포함 관계, 노드·연결 요약, 없는 파일 목록)를 읽습니다. 원문 JSON 대신 이 도구를 쓰며, 정확한 볼트 경로가 필요합니다.',
          en: 'Read the structure of an Obsidian canvas (.canvas) file: node counts by type, group containment, node and edge summaries, and missing files. Use this instead of reading raw JSON; requires the exact vault path.',
        },
        locale,
      ),
      {
        path: {
          type: 'string',
          description: L(
            {
              ko: '읽을 .canvas 파일의 정확한 볼트 상대 경로.',
              en: 'Exact vault-relative path to the .canvas file.',
            },
            locale,
          ),
        },
      },
      ['path'],
    ),
    tool(
      'edit_canvas',
      L(
        {
          ko: '기존 Obsidian 캔버스(.canvas) 파일을 구조화 작업(add_text, add_file, add_edge, update_text, remove_node, remove_edge)으로 수정하는 변경을 제안합니다. 새 노드 위치와 16자리 hex ID를 자동으로 계산하고 원본 들여쓰기·줄바꿈을 보존합니다. 원문 JSON을 다시 쓰지 말고 이 도구를 쓰며, 정확한 볼트 경로가 필요합니다.',
          en: 'Propose structured edits to an existing Obsidian canvas (.canvas) file using operations (add_text, add_file, add_edge, update_text, remove_node, remove_edge). Automatically computes node placement and 16-char hex IDs while preserving original indentation and line endings. Use this instead of rewriting raw JSON; requires the exact vault path.',
        },
        locale,
      ),
      {
        path: {
          type: 'string',
          description: L(
            {
              ko: '수정할 .canvas 파일의 정확한 볼트 상대 경로.',
              en: 'Exact vault-relative path to the .canvas file.',
            },
            locale,
          ),
        },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: [
                  'add_text',
                  'add_file',
                  'add_edge',
                  'update_text',
                  'remove_node',
                  'remove_edge',
                ],
                description: L(
                  {
                    ko: '작업 종류: add_text, add_file, add_edge, update_text, remove_node, remove_edge.',
                    en: 'Operation type: add_text, add_file, add_edge, update_text, remove_node, or remove_edge.',
                  },
                  locale,
                ),
              },
              text: {
                type: 'string',
                description: L(
                  {
                    ko: 'add_text 또는 update_text의 텍스트 내용.',
                    en: 'Text content for add_text or update_text.',
                  },
                  locale,
                ),
              },
              file: {
                type: 'string',
                description: L(
                  {
                    ko: 'add_file로 추가할 볼트 파일의 정확한 경로.',
                    en: 'Exact vault path of the file for add_file.',
                  },
                  locale,
                ),
              },
              near: {
                type: 'string',
                description: L(
                  {
                    ko: 'add_text·add_file 배치 기준(노드 id, 파일 경로, 또는 같은 호출의 ref).',
                    en: 'Anchor for add_text or add_file placement (node id, file path, or same-call ref).',
                  },
                  locale,
                ),
              },
              ref: {
                type: 'string',
                description: L(
                  {
                    ko: '같은 호출의 이후 작업(near, from, to)에서 참조할 임시 이름.',
                    en: 'Temporary name referenced by later operations (near, from, to) in the same call.',
                  },
                  locale,
                ),
              },
              color: {
                type: 'string',
                description: L(
                  {
                    ko: 'add_text·add_file 색상("1"~"6" 또는 #RGB/#RRGGBB, 선택).',
                    en: 'Optional color for add_text or add_file ("1"-"6" or #RGB/#RRGGBB).',
                  },
                  locale,
                ),
              },
              from: {
                type: 'string',
                description: L(
                  {
                    ko: 'add_edge 출발 노드(노드 id, 유일한 파일 노드의 파일 경로, 또는 ref).',
                    en: 'Source node for add_edge (node id, unique file node path, or ref).',
                  },
                  locale,
                ),
              },
              to: {
                type: 'string',
                description: L(
                  {
                    ko: 'add_edge 도착 노드(노드 id, 유일한 파일 노드의 파일 경로, 또는 ref).',
                    en: 'Target node for add_edge (node id, unique file node path, or ref).',
                  },
                  locale,
                ),
              },
              label: {
                type: 'string',
                description: L(
                  {
                    ko: 'add_edge 라벨(선택).',
                    en: 'Optional label for add_edge.',
                  },
                  locale,
                ),
              },
              id: {
                type: 'string',
                description: L(
                  {
                    ko: 'update_text·remove_node·remove_edge 대상 id.',
                    en: 'Target id for update_text, remove_node, or remove_edge.',
                  },
                  locale,
                ),
              },
            },
            required: ['op'],
          },
          description: L(
            {
              ko: '순서대로 적용할 캔버스 편집 작업 목록.',
              en: 'Ordered list of canvas edit operations to apply.',
            },
            locale,
          ),
        },
      },
      ['path', 'operations'],
    ),
  ]
}

export const CORE_TOOL_DEFINITIONS = getCoreToolDefinitions()

type CoreRegistryEntry = Omit<ToolRegistryEntry, 'definition'>

export const CORE_TOOL_REGISTRY: Record<
  (typeof CORE_TOOL_NAMES)[number],
  CoreRegistryEntry
> = {
  daily_note: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
    evidenceRole: 'reading',
    requiresCorePlugin: 'daily-notes',
  },
  create_from_template: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
    requiresCorePlugin: 'templates',
  },
  list_bookmarks: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    evidenceRole: 'discovery',
    requiresCorePlugin: 'bookmarks',
  },
  open_in_obsidian: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  read_canvas: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    evidenceRole: 'reading',
  },
  edit_canvas: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
  },
}
