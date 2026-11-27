import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export const CORE_PLUGIN_NAMES: Record<string, string> = {
  'note-composer': 'Note Composer',
  'daily-notes': 'Daily notes',
  templates: 'Templates',
  bookmarks: 'Bookmarks',
  canvas: 'Canvas',
  bases: 'Bases',
  graph: 'Graph view',
  'global-search': 'Search',
  backlink: 'Backlinks',
  outline: 'Outline',
  'tag-pane': 'Tags view',
}

export const CORE_PLUGIN_IDS = new Set(Object.keys(CORE_PLUGIN_NAMES))

export function corePluginProviderId(id: string): string {
  return CORE_PLUGIN_NAMES[id] ?? id
}

export function corePluginLabel(id: string, locale?: ModelLocale): string {
  switch (id) {
    case 'note-composer':
      return L(
        { ko: '노트 작성기(Note Composer)', en: 'Note Composer' },
        locale,
      )
    case 'daily-notes':
      return L({ ko: '일일노트(Daily notes)', en: 'Daily notes' }, locale)
    case 'templates':
      return L({ ko: '템플릿(Templates)', en: 'Templates' }, locale)
    case 'bookmarks':
      return L({ ko: '북마크(Bookmarks)', en: 'Bookmarks' }, locale)
    case 'canvas':
      return L({ ko: '캔버스(Canvas)', en: 'Canvas' }, locale)
    case 'bases':
      return L({ ko: 'Bases', en: 'Bases' }, locale)
    case 'graph':
      return L({ ko: '그래프 뷰(Graph view)', en: 'Graph view' }, locale)
    case 'global-search':
      return L({ ko: '검색(Search)', en: 'Search' }, locale)
    case 'backlink':
      return L({ ko: '백링크(Backlinks)', en: 'Backlinks' }, locale)
    case 'outline':
      return L({ ko: '개요(Outline)', en: 'Outline' }, locale)
    case 'tag-pane':
      return L({ ko: '태그(Tags view)', en: 'Tags view' }, locale)
    default:
      return corePluginProviderId(id)
  }
}

export function corePluginDisabledError(
  id: string,
  locale?: ModelLocale,
): string {
  const name = corePluginLabel(id, locale)
  return L(
    {
      ko: `Obsidian 설정에서 ${name} 코어 플러그인이 꺼져 있습니다.`,
      en: `The ${name} core plugin is disabled in Obsidian settings.`,
    },
    locale,
  )
}
