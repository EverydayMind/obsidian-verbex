import { L } from '../../i18n/modelText'

export function allPairs(noteCount: number, pairCount: number) {
  return L({
    ko: `조건에 맞는 노트 ${noteCount}개, 쌍 ${pairCount}개(전부 표시)`,
    en: `${noteCount} matching notes, ${pairCount} pairs (all shown)`,
  })
}

export function partialPairs(
  noteCount: number,
  pairCount: number,
  shown: number,
) {
  return L({
    ko: `조건에 맞는 노트 ${noteCount}개, 쌍 ${pairCount}개 중 ${shown}개 표시(일부만 표시)`,
    en: `${noteCount} matching notes, showing ${shown} of ${pairCount} pairs (partially shown)`,
  })
}

export function multiPairSumFact(pairSum: number, noteCount: number) {
  return L({
    ko: `쌍별 수의 합(${pairSum})은 노트 수(${noteCount})보다 클 수 있습니다(목록 속성).`,
    en: `The sum of pair counts (${pairSum}) can exceed the note count (${noteCount}) because of list properties.`,
  })
}

export function genericMultiPair() {
  return L({
    ko: '목록 값은 여러 쌍에 셀 수 있습니다.',
    en: 'List values may be counted in multiple pairs.',
  })
}

export function firstTotalsLine(
  firstField: string,
  dateSuffix: string,
  items: string,
) {
  return L({
    ko: `\n${firstField}${dateSuffix}별 노트 수: ${items}`,
    en: `\nNotes by ${firstField}${dateSuffix}: ${items}`,
  })
}

export function moreFirstKeys(remaining: number) {
  return L({
    ko: `… 외 ${remaining}개`,
    en: `… and ${remaining} more`,
  })
}

export function crossCounts(
  firstField: string,
  secondField: string,
  dateSuffix: string,
  status: string,
  fact: string,
  firstLine: string,
  pairText: string,
) {
  return L({
    ko: `\n${firstField} × ${secondField}${dateSuffix}별 노트 수 — ${status}. ${fact}${firstLine}${pairText}`,
    en: `\nNote counts by ${firstField} × ${secondField}${dateSuffix} — ${status}. ${fact}${firstLine}${pairText}`,
  })
}
