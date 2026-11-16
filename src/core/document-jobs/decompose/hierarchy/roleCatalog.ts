import type { ModelLocale } from '../../../../i18n/modelLocale'
import { L } from '../../../../i18n/modelText'

import { roleCatalog } from './roleCatalogText'

// Python's Unicode word boundary is expressed explicitly: JS \b is ASCII-only.
const reporters = [
  /\d{4}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}/u,
  /[가-힣]+(담당관실|과|팀|실|국|부|처|청)(?![\p{L}\p{N}_])/u,
  /\d{2,4}-\d{3,4}-\d{4}/u,
  /사무관|주무관|과장|팀장|연구관|연구사/u,
]
export const reporterScore = (text: string) =>
  reporters.filter((r) => r.test(text)).length
export const isAppendix = (text: string) =>
  /^\s*(?:(?:<|〈|\[)\s*(?:참고|붙임|별첨)|(?:붙임|별첨)\s*\d*(?:\s|$))/u.test(
    text,
  )
export const isNoteLabel = (text: string) =>
  /^\s*\((?:주의|참고|유의)\)/u.test(text)
export const isCatalogRole = (name: string): boolean =>
  Object.keys(roleCatalog().descriptions).includes(name)
export function roleDescription(
  name: string,
  size: number | null,
  locale?: ModelLocale,
): string {
  if (name === '깊은단계')
    return L(
      {
        ko: '6단계 제목 아래에 이어지는 깊은 위계 문단',
        en: 'A deeper hierarchical paragraph below a level-6 heading',
      },
      locale,
    )
  const catalog = roleCatalog(locale)
  const description =
    catalog.descriptions[name as keyof typeof catalog.descriptions] ?? ''
  return description.replace(
    '{size}pt',
    size === null
      ? L({ ko: '크기 미측정', en: 'size not measured' }, locale)
      : `${size}pt`,
  )
}
