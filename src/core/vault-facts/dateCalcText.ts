import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
export function weekdayNames(locale?: ModelLocale) {
  return L(
    {
      ko: [
        '일요일',
        '월요일',
        '화요일',
        '수요일',
        '목요일',
        '금요일',
        '토요일',
      ],
      en: [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ],
    },
    locale,
  )
}

export function dateFormatError() {
  return L({
    ko: '날짜는 YYYY-MM-DD 형식이어야 합니다.',
    en: 'Dates must use YYYY-MM-DD format.',
  })
}

export function invalidDateError() {
  return L({ ko: '유효하지 않은 날짜입니다.', en: 'Invalid date.' })
}

export function dateConflictError() {
  return L({
    ko: 'to와 add_days는 함께 쓸 수 없습니다.',
    en: 'to and add_days cannot be used together.',
  })
}

export function dateHeader(today: string, from: string) {
  return L({
    ko: `오늘 날짜: ${today}\n기준 날짜: ${from}`,
    en: `Today: ${today}\nBase date: ${from}`,
  })
}

export function dateDifference(
  target: string,
  difference: number,
  weekdays: number,
) {
  return L({
    ko: `\n대상 날짜: ${target}\n날짜 차이: ${difference}일\n주말 제외: ${difference < 0 ? -weekdays : weekdays}일`,
    en: `\nTarget date: ${target}\nDate difference: ${difference} days\nExcluding weekends: ${difference < 0 ? -weekdays : weekdays} days`,
  })
}

export function dateFooter(text: string) {
  return L({
    ko: `${text}\n공휴일은 반영하지 않습니다.`,
    en: `${text}\nPublic holidays are not taken into account.`,
  })
}
