import type { ModelLocale } from '../../i18n/modelLocale'

import * as dateText from './dateCalcText'

const DAY = 86_400_000

export function weekdays(locale?: ModelLocale): string[] {
  return dateText.weekdayNames(locale)
}

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(dateText.dateFormatError())
  const [, y, m, d] = match.map(Number)
  const time = Date.UTC(y, m - 1, d)
  const date = new Date(time)
  if (
    y < 1900 ||
    y > 2200 ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    throw new Error(dateText.invalidDateError())
  return time
}

function describe(time: number): string {
  const date = new Date(time)
  const thursday = new Date(time + (4 - (date.getUTCDay() || 7)) * DAY)
  const year = thursday.getUTCFullYear()
  const week = Math.ceil(
    ((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7,
  )
  return `${date.toISOString().slice(0, 10)} (${weekdays()[date.getUTCDay()]}, ISO ${year}-W${String(week).padStart(2, '0')})`
}

export function dateCalc(
  args: { from?: string; to?: string; add_days?: number },
  clock: () => Date = () => new Date(),
): string {
  const today = localDate(clock())
  const from = parseDate(args.from ?? today)
  if (args.to !== undefined && args.add_days !== undefined)
    throw new Error(dateText.dateConflictError())
  const target =
    args.to !== undefined
      ? parseDate(args.to)
      : args.add_days !== undefined
        ? from + args.add_days * DAY
        : undefined
  let text = dateText.dateHeader(describe(parseDate(today)), describe(from))
  if (target !== undefined) {
    parseDate(new Date(target).toISOString().slice(0, 10))
    const difference = (target - from) / DAY
    const start = Math.min(from, target)
    const end = Math.max(from, target)
    let weekdays = 0
    for (let t = start + DAY; t <= end; t += DAY)
      if (![0, 6].includes(new Date(t).getUTCDay())) weekdays++
    text += dateText.dateDifference(describe(target), difference, weekdays)
  }
  return dateText.dateFooter(text)
}
