import { App, TFile, parseYaml } from 'obsidian'

import { L } from '../../i18n/modelText'

const MAX_BASE_FILES = 50
const MAX_VIEWS = 8

function viewNames(raw: string): string[] {
  try {
    const parsed = parseYaml(raw) as { views?: { name?: unknown }[] } | null
    return (parsed?.views ?? [])
      .map((view) => view?.name)
      .filter((name): name is string => typeof name === 'string' && !!name)
  } catch {
    return []
  }
}

/**
 * Base views the user already defined for a property value: Base embeds in the
 * value's own note (`category: [[과제들]]` → `과제들.md`) and `.base` files whose
 * definition quotes the value. These are facts about the vault, so the model can
 * render the user's own filter instead of re-deriving it note by note.
 */
export async function relatedBaseViews(
  app: App,
  value: string,
): Promise<string> {
  const text = (value.match(/^\[\[([^\]|#]+)/)?.[1] ?? value).trim()
  if (!text) return ''
  const views = new Map<string, string>()
  const valueNote = app.metadataCache.getFirstLinkpathDest?.(text, '')
  const notePath = valueNote?.path ?? ''
  const embeds = valueNote
    ? (app.metadataCache.getFileCache(valueNote)?.embeds ?? [])
    : []
  for (const embed of embeds) {
    const [link, view] = embed.link.split('#')
    const dest = app.metadataCache.getFirstLinkpathDest?.(link, notePath)
    if (dest?.extension === 'base')
      views.set(
        view ? `${dest.path}#${view}` : dest.path,
        L({ ko: `${notePath}에 임베드`, en: `Embedded in ${notePath}` }),
      )
  }
  const quoted = [`"${text}"`, `'${text}'`]
  const bases = (app.vault.getFiles?.() ?? [])
    .filter((file: TFile) => file.extension === 'base')
    .slice(0, MAX_BASE_FILES)
  for (const file of bases) {
    const raw = await app.vault.cachedRead(file)
    if (!quoted.some((q) => raw.includes(q))) continue
    const names = viewNames(raw)
    for (const name of names.length ? names : [''])
      if (!views.has(name ? `${file.path}#${name}` : file.path))
        views.set(
          name ? `${file.path}#${name}` : file.path,
          L({ ko: '정의에 값 포함', en: 'Value included in definition' }),
        )
  }
  if (views.size === 0) return ''
  const lines = [...views].slice(0, MAX_VIEWS).map(([target, why]) => {
    const [path, view] = target.split('#')
    return `- render_base(path="${path}"${view ? `, view="${view}"` : ''}) — ${why}`
  })
  return (
    L({
      ko: `\n\n관련 Base 뷰 ${views.size}개(사용자가 정의한 Obsidian Base 조건). `,
      en: `

${views.size} related Base views (Obsidian Base conditions defined by the user). `,
    }) +
    L({
      ko: '요청 조건과 같은 뷰가 있으면 노트를 하나씩 읽어 판정하지 말고 그 뷰를 렌더링하세요:\n',
      en: 'If a view matches the requested conditions, render that view instead of reading and judging notes one by one:\n',
    }) +
    lines.join('\n')
  )
}
