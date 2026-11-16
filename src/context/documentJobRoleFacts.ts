import { L } from '../i18n/modelText'
import type { JsonObject } from '../provider/interop/protocol'
export function roleCounts(contract: JsonObject): Record<string, number> {
  const raw = contract.role_counts
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>))
    if (Number.isInteger(value) && (value as number) >= 0)
      out[key] = value as number
  return out
}

export function headingRules(roles: Record<string, unknown>): string[] {
  const levels = Object.keys(roles)
    .filter((role) => /^H[1-9]$/.test(role))
    .map((role) => Number(role.slice(1)))
    .sort((a, b) => a - b)
  return [
    ...(levels.length
      ? [
          L({
            ko: `제목은 ${levels.map((level) => '`' + '#'.repeat(level) + '`').join('·')} ${levels.length}단계만 씁니다(각 기호 뒤에 공백). 그보다 깊은 제목은 샘플 규칙이 없어 기본 모양으로 나옵니다`,
            en: `Use only these ${levels.length} heading levels: ${levels.map((level) => '`' + '#'.repeat(level) + '`').join('·')} (a space after each marker). Deeper headings have no sample rule and render in the default style`,
          }),
        ]
      : [
          L({
            ko: '제목은 샘플 규칙이 없어 기본 모양으로 나옵니다',
            en: `Headings have no sample rule and render in the default style`,
          }),
        ]),
  ]
}
