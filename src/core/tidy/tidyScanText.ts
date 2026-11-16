import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function scanTruncated(
  count: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: ` 중 앞의 ${count}개만 검사(잘림)`,
      en: `; only the first ${count} inspected (truncated)`,
    },
    locale,
  )
}

export function displayLimit(
  limit: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    { ko: `, 앞 ${limit}개 표시`, en: `, showing the first ${limit}` },
    locale,
  )
}

export function pairExplanation(locale: ModelLocale = getModelLocale()) {
  return L(
    {
      ko: '같은 블록 수·작은 쪽 대비 비율·제목 단어 겹침·나가는 링크 겹침(0~1)입니다. 병합 전 compare_notes로 확인하세요.',
      en: 'Shared block count, ratio relative to the smaller note, title word overlap, and outgoing link overlap (0–1). Check with compare_notes before merging.',
    },
    locale,
  )
}

export function pair(
  a: string | number,
  b: string | number,
  sharedBlocks: string | number,
  sharedRatio: string | number,
  titleOverlap: string | number,
  sharedLinks: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `- ${a} ↔ ${b}: 같은 블록 ${sharedBlocks}개(비율 ${sharedRatio}), 제목 ${titleOverlap}, 링크 ${sharedLinks}`,
      en: `- ${a} ↔ ${b}: ${sharedBlocks} shared blocks (ratio ${sharedRatio}), title ${titleOverlap}, links ${sharedLinks}`,
    },
    locale,
  )
}

export function missingLinksHeading(
  count: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `## 노트가 없는 링크 이름 (${count}개)`,
      en: `## Link names without notes (${count})`,
    },
    locale,
  )
}

export function missingLink(
  name: string | number,
  count: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `- ${name}: ${count}개 노트에서 링크`,
      en: `- ${name}: linked from ${count} notes`,
    },
    locale,
  )
}

export function untypedHeading(
  count: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `## type 속성이 없는 노트 (${count}개)`,
      en: `## Notes without a type property (${count})`,
    },
    locale,
  )
}

export function unsafeHeading(
  count: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `## Windows 파일 이름으로 안전하지 않은 제목 (${count}개)`,
      en: `## Titles unsafe as Windows file names (${count})`,
    },
    locale,
  )
}

export function tasksHeading(
  count: string | number,
  locale: ModelLocale = getModelLocale(),
) {
  return L(
    {
      ko: `## 과제·아이디어 노트 (${count}개)`,
      en: `## Task/idea notes (${count})`,
    },
    locale,
  )
}

export function none(locale: ModelLocale = getModelLocale()) {
  return L({ ko: '(없음)', en: '(none)' }, locale)
}
