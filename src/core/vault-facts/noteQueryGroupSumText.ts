import { L } from '../../i18n/modelText'

import { noValue } from './noteQueryToolsText'

export function groupSumFact(groupSum: number, noteCount: number) {
  if (groupSum === noteCount)
    return L({
      ko: `묶음 값 합계 ${groupSum} = 조건에 맞는 노트 ${noteCount}개(노트마다 묶음 하나).`,
      en: `Group count sum ${groupSum} = ${noteCount} matching notes (one group per note).`,
    })
  if (groupSum > noteCount)
    return L({
      ko: `묶음 값 합계 ${groupSum}(노트 ${noteCount}개보다 많음: 목록 값이 여러 묶음에 세어진 노트가 있음).`,
      en: `Group count sum ${groupSum} (more than ${noteCount} matching notes: some notes have list values counted in multiple groups).`,
    })
  const missing = noteCount - groupSum
  const emptyLabel = noValue()
  return L({
    ko: `묶음 값 합계 ${groupSum}(노트 ${noteCount}개보다 적음: 이 묶음 목록에 포함되지 않은 노트가 ${missing}개 있음; 값이 없는 노트는 보통 ${emptyLabel} 묶음에 포함됨).`,
    en: `Group count sum ${groupSum} (fewer than ${noteCount} matching notes: ${missing} notes are not counted in these groups; notes without a value are normally counted under ${emptyLabel}).`,
  })
}
