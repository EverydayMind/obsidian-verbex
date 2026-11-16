import { L } from '../../i18n/modelText'

export function budgetToolList(shown: readonly string[]): string {
  return (
    shown.slice(0, 8).join(', ') +
    (shown.length > 8
      ? L({
          ko: ` 외 ${shown.length - 8}개`,
          en: ` and ${shown.length - 8} more`,
        })
      : '')
  )
}
