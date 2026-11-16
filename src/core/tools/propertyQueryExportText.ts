import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function title(
  condition: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    { ko: `# 전수 목록: ${condition}`, en: `# Exhaustive list: ${condition}` },
    locale,
  )
}

export function matchCount(
  count: string | number,
  cursor: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `- 조건 일치 ${count}개 (조회 시작 시점 snapshot, cursor \`${cursor}\`)`,
      en: `- ${count} matches (snapshot at query start, cursor \`${cursor}\`)`,
    },
    locale,
  )
}

export function exportStamp(
  stamp: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `- 내보낸 시각: ${stamp} · Verbex host가 snapshot 전체를 기록했다. 이후 노트 변경은 반영되지 않는다.`,
      en: `- Exported at: ${stamp} · The Verbex host recorded the entire snapshot. Subsequent note changes are not reflected.`,
    },
    locale,
  )
}

export function tableHeader(
  columns: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    { ko: `| # | 노트 | ${columns} |`, en: `| # | Note | ${columns} |` },
    locale,
  )
}
