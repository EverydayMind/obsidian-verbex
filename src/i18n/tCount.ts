import { t } from './index'

/** Two keys per counted label, so English gets "1 tool" and "2 tools" without "(s)". */
export function tCount(count: number, one: string, many: string): string {
  return t(count === 1 ? one : many, { n: count })
}
