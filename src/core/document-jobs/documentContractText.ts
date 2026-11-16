import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function decompositionTables(locale?: ModelLocale) {
  return L({ ko: 'Markdown 표', en: 'Markdown tables' }, locale)
}

export function decompositionUnmeasured(locale?: ModelLocale) {
  return L(
    {
      ko: '서식·여백 전체는 실행 중 측정하지 않음',
      en: 'Full formatting and spacing are not measured at runtime',
    },
    locale,
  )
}
export function draftStructureGuidance(
  p0: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `초안 문단 ${p0}개가 기호·번호 글자나 Markdown 목록으로 시작합니다. v2에서는 제목 단계와 역할 지시로 쓰고 기호는 템플릿이 붙입니다. 고친 초안으로 produce_format_reuse를 다시 호출할 수 있습니다.`,
      en: `${p0} draft paragraphs begin with symbols, numbering characters or Markdown lists. In v2, use heading levels and role directives; the template adds the symbols. You can call produce_format_reuse again with the corrected draft.`,
    },
    locale,
  )
}

export function fixedRegionReference(
  p0: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `<!-- hwpx:fixed
템플릿이 그대로 출력하는 앞쪽 고정 영역의 글입니다(참고용).
${p0}
-->`,
      en: `<!-- hwpx:fixed
Text from the front fixed region that the template outputs unchanged (for reference).
${p0}
-->`,
    },
    locale,
  )
}

export function draftTables(locale?: ModelLocale) {
  return L({ ko: 'Markdown 표', en: 'Markdown tables' }, locale)
}

export function cellFormatting(locale?: ModelLocale) {
  return L({ ko: 'CELL_* 서식', en: 'CELL_* formatting' }, locale)
}

export function tableLeadingSpace(locale?: ModelLocale) {
  return L({ ko: '표 앞 여백', en: 'Space before tables' }, locale)
}

export function sentenceStatsUnavailable(locale?: ModelLocale) {
  return L(
    { ko: '문장 통계 미측정', en: 'Sentence statistics not measured' },
    locale,
  )
}

export function contextSpacingOmitted(
  p0: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `문맥 여백 규칙 제외: ${p0}`,
      en: `Context spacing rule omitted: ${p0}`,
    },
    locale,
  )
}

export function sectionDifferencesTruncated(locale?: ModelLocale) {
  return L(
    {
      ko: '구역 차이 100개 이후 생략',
      en: 'Section differences after the first 100 omitted',
    },
    locale,
  )
}

export function humanFormatCheck(locale?: ModelLocale) {
  return L(
    {
      ko: '한글에서 열어 표 서식과 여백을 확인하세요.',
      en: 'Open in Hancom Hangul to check table formatting and spacing.',
    },
    locale,
  )
}
