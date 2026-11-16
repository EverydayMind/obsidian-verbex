import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function requirements(locale: ModelLocale): Record<string, string> {
  return {
    sum: L(
      {
        ko: 'sum(x, ...)은 인자가 1개 이상 필요합니다.',
        en: 'sum(x, ...) requires at least one argument.',
      },
      locale,
    ),
    avg: L(
      {
        ko: 'avg(x, ...)은 인자가 1개 이상 필요합니다.',
        en: 'avg(x, ...) requires at least one argument.',
      },
      locale,
    ),
    min: L(
      {
        ko: 'min(x, ...)은 인자가 1개 이상 필요합니다.',
        en: 'min(x, ...) requires at least one argument.',
      },
      locale,
    ),
    max: L(
      {
        ko: 'max(x, ...)은 인자가 1개 이상 필요합니다.',
        en: 'max(x, ...) requires at least one argument.',
      },
      locale,
    ),
    abs: L(
      {
        ko: 'abs(x)는 인자 1개가 필요합니다.',
        en: 'abs(x) requires one argument.',
      },
      locale,
    ),
    sqrt: L(
      {
        ko: 'sqrt(x)는 0 이상의 인자 1개가 필요합니다.',
        en: 'sqrt(x) requires one nonnegative argument.',
      },
      locale,
    ),
    round: L(
      {
        ko: 'round(x, n)의 n은 0~10 정수이며 인자는 1개 또는 2개입니다.',
        en: 'round(x, n) requires one or two arguments; n must be an integer from 0 to 10.',
      },
      locale,
    ),
    pct_change: L(
      {
        ko: 'pct_change(a, b)는 인자 2개가 필요하며 a는 0이 아닙니다.',
        en: 'pct_change(a, b) requires two arguments; a must be nonzero.',
      },
      locale,
    ),
    share: L(
      {
        ko: 'share(a, total)은 인자 2개가 필요하며 total은 0이 아닙니다.',
        en: 'share(a, total) requires two arguments; total must be nonzero.',
      },
      locale,
    ),
  }
}
