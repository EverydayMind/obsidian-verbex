import { getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

import { requirements } from './calculationRequirements'

export function functionError(name: string): string {
  return (
    requirements(getModelLocale())[name] ??
    L({
      ko: `알 수 없는 함수 ${name}. 사용 가능: sum, avg, min, max, abs, sqrt, round, pct_change, share.`,
      en: `Unknown function ${name}. Available: sum, avg, min, max, abs, sqrt, round, pct_change, share.`,
    })
  )
}

export function round(value: number, digits: number): number {
  const [coefficient, exponent = '0'] = Math.abs(value).toString().split('e')
  const shifted = Number(`${coefficient}e${Number(exponent) + digits}`)
  if (!Number.isFinite(shifted)) return value
  const [rounded, roundedExponent = '0'] = Math.round(shifted)
    .toString()
    .split('e')
  return (
    Math.sign(value) * Number(`${rounded}e${Number(roundedExponent) - digits}`)
  )
}
