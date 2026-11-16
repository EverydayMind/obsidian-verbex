import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { tool } from '../tools/toolHelper'

export function getVaultCalculationDefinitions(
  _locale: ModelLocale = getModelLocale(),
) {
  return [
    tool(
      'date_calc',
      "Calculate signed days from from to to, days excluding weekends (earlier date excluded, later date included; negative when to precedes from), each date's weekday and ISO week, or add_days to from. With no arguments return today and its weekday. Holidays are not considered.",
      {
        from: {
          type: 'string',
          description: 'Start date YYYY-MM-DD; defaults to today.',
        },
        to: {
          type: 'string',
          description: 'End date YYYY-MM-DD; cannot be combined with add_days.',
        },
        add_days: {
          type: 'number',
          minimum: -36500,
          maximum: 36500,
          description: 'Integer number of days to add.',
        },
      },
    ),
    tool(
      'calculate',
      'Evaluate + - * / ^ and parentheses. sum, avg, min, max aggregate values; abs gives absolute value; sqrt gives square root; round(x, n) rounds to n digits; pct_change(a, b) gives percent change from a to b; share(a, total) gives percentage share. Example: avg(99.4, 94.5, 110.3). Do not use thousands separators: commas separate function arguments.',
      {
        expression: {
          type: 'string',
          maxLength: 500,
          description: 'Arithmetic expression.',
        },
      },
      ['expression'],
    ),
  ]
}
