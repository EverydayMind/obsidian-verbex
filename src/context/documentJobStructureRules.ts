import { L } from '../i18n/modelText'

import { headingRules } from './documentJobRoleFacts'
/** Heading and separator guidance comes only from contract marker roles. */
export function documentJobStructureRules(
  roles: Record<string, unknown>,
): string[] {
  return [
    ...headingRules(roles),
    ...('HR' in roles
      ? []
      : [
          L({
            ko: '본문 구분선(`---`)은 샘플 규칙이 없어 쓰지 않습니다',
            en: `Do not use body separators (\`---\`); the sample has no rule for them`,
          }),
        ]),
  ]
}
