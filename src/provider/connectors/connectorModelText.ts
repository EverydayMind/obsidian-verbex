import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function connectorResult(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  p3: string | number,
  p4: string | number,
  p5: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `[플러그인 커넥터 결과: ${p0}/${p1}, 대상 v${p2}]
${p3}
[Result truncated=${p4}]${p5}`,
      en: `[Plugin connector result: ${p0}/${p1}, target v${p2}]
${p3}
[Result truncated=${p4}]${p5}`,
    },
    locale,
  )
}
export function connectorVaultEvents(
  p0: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `
호출 중 Vault 변경 ${p0}건 관측, 원인 미확정`,
      en: `
Observed ${p0} Vault changes during the call; cause unattributed`,
    },
    locale,
  )
}

export function targetDisabled(locale?: ModelLocale) {
  return L({ ko: '대상 플러그인 꺼짐', en: 'Target plugin disabled' }, locale)
}

export function targetInvalid(locale?: ModelLocale) {
  return L({ ko: '대상 플러그인 오류', en: 'Target plugin invalid' }, locale)
}

export function apiObjectMissing(locale?: ModelLocale) {
  return L({ ko: 'API 객체 없음', en: 'API object unavailable' }, locale)
}

export function tasksDescription(locale?: ModelLocale) {
  return L(
    {
      ko: 'Tasks 규칙으로 작업 줄의 상태를 토글한 Markdown을 반환합니다. 반복 작업은 두 줄일 수 있습니다. 파일은 쓰지 않습니다. 결과를 replace_in_file의 Diff 승인으로 적용하세요.',
      en: 'Returns Markdown with the task line status toggled according to Tasks rules. Recurring tasks may produce two lines. Does not write files. Apply the result through replace_in_file Diff approval.',
    },
    locale,
  )
}
