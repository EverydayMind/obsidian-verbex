import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function approvalResult(
  status: string,
  binding: string,
  locale?: ModelLocale,
) {
  return result(
    status === 'applied' ? applied(locale) : partial(locale),
    binding === 'bound'
      ? bound(locale)
      : binding === 'unbound'
        ? unbound(locale)
        : unavailable(locale),
    binding,
    locale,
  )
}

export function note(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `서식 작업 초안: 호스트가 frontmatter \`hwpx-dialect\`·\`hwpx-template\`를 작업 템플릿 \`${p0}\`에 맞췄습니다.`,
      en: `Format job draft: The host aligned frontmatter \`hwpx-dialect\` and \`hwpx-template\` with the job template \`${p0}\`.`,
    },
    locale,
  )
}

export function approvalFrontmatter(locale?: ModelLocale) {
  return L(
    {
      ko: '승인 요청에서 frontmatter',
      en: 'frontmatter in the approval request',
    },
    locale,
  )
}

export function result(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `승인 결과: ${p0}. 저장된 파일의 결속: ${p1}(${p2}).`,
      en: `Approval result: ${p0}. Saved file binding: ${p1}(${p2}).`,
    },
    locale,
  )
}

export function applied(locale?: ModelLocale) {
  return L({ ko: '적용', en: 'Applied' }, locale)
}

export function partial(locale?: ModelLocale) {
  return L({ ko: '부분 적용', en: 'Partially applied' }, locale)
}

export function bound(locale?: ModelLocale) {
  return L({ ko: '있음', en: 'Present' }, locale)
}

export function unbound(locale?: ModelLocale) {
  return L({ ko: '없음', en: 'Absent' }, locale)
}

export function unavailable(locale?: ModelLocale) {
  return L({ ko: '확인 불가', en: 'Unavailable' }, locale)
}

export function unsupported(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `frontmatter를 호스트가 고칠 수 없는 형식이라 그대로 두었습니다(${p0}).`,
      en: `The frontmatter was left unchanged because its format cannot be corrected by the host (${p0}).`,
    },
    locale,
  )
}

export function missingMeta(p0: string | number, locale?: ModelLocale) {
  return L(
    { ko: `META 키 \`${p0}\`가 없습니다`, en: `META key \`${p0}\` is missing` },
    locale,
  )
}
