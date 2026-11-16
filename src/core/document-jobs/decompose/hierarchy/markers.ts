import table from '../../../../../contracts/report-style/md-dialect-v2/marker-table.json'
import type { HierarchyMarker, MarkerSeries } from '../dialectV2'

import { required } from './required'

export const isWS = (ch: string) => table.WS.includes(ch.codePointAt(0) ?? -1)
export const trimWS = (text: string) => {
  const chars = [...text]
  while (chars.length && isWS(chars[0])) chars.shift()
  return chars.join('')
}
export const noMarker = (): HierarchyMarker => ({
  symbol: null,
  rank: null,
  series: null,
  value: null,
})
/** Prefix may annotate literal text or supply an external numbering token. */
export function visibleText(text: string, prefix: string | null): string {
  if (!prefix) return text
  const front = trimWS(text),
    rest = front.slice(prefix.length)
  if (
    front.startsWith(prefix) &&
    (!rest || isWS(rest[0]) || classifyMarker(front).symbol === prefix)
  )
    return text
  return prefix + ' ' + text
}
export function classifyMarker(text: string): HierarchyMarker {
  const chars = [...trimWS(text)],
    ch = chars[0]
  if (!ch) return noMarker()
  const cp = required(ch.codePointAt(0))
  for (const s of table.series) {
    if (
      s.start !== undefined &&
      s.end !== undefined &&
      cp >= s.start &&
      cp <= s.end
    )
      return {
        symbol: ch,
        rank: s.rank as HierarchyMarker['rank'],
        series: s.name as MarkerSeries,
        value: cp - s.start + s.minValue,
      }
  }
  for (const s of table.ranked)
    if (s.symbols.includes(ch) && (!chars[1] || isWS(chars[1])))
      return {
        ...noMarker(),
        symbol: ch,
        rank: s.rank as HierarchyMarker['rank'],
      }
  const attached = table.attached.find((a) => a.symbol === ch)
  if (attached) {
    let n = 1
    if (attached.repeat) while (chars[n] === ch) n++
    return { ...noMarker(), symbol: ch.repeat(n) }
  }
  return noMarker()
}
export function sectionNumber(text: string): string | null {
  const match = /^\d+\./.exec(trimWS(text))?.[0]
  return match && isWS(trimWS(text).slice(match.length, match.length + 1))
    ? match
    : null
}
export function seriesText(series: MarkerSeries, value: number): string | null {
  const s = required(table.series.find((s) => s.name === series))
  return value >= 1 && value <= required(s.maxValue)
    ? String.fromCodePoint(required(s.start) + value - required(s.minValue))
    : null
}
