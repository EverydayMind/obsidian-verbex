import { L } from '../../i18n/modelText'

export function priority(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `## 우선 참고 위키 — ${p0}
${p1}
## 기타 파일
${p2}`,
    en: `## Priority reference wiki — ${p0}
${p1}
## Other files
${p2}`,
  })
}
