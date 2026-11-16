import { L } from '../../i18n/modelText'

export function expressionError() {
  return L({
    ko: 'expression은 500자 이하의 식이어야 합니다.',
    en: 'expression must be a nonempty expression of at most 500 characters.',
  })
}
