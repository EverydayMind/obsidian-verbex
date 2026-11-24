import { modelMarker } from '../i18n/modelMarkers'
import { L } from '../i18n/modelText'

export function remainingChangesFact(count: number, paths: string) {
  const fact = modelMarker('harnessFact')
  return L({
    ko: `\n${fact} 이번 복원은 마지막 변경 1건만 되돌렸다. 같은 대화에서 그보다 먼저 적용된 변경 ${count}건(경로: ${paths})은 그대로 남아 있다.`,
    en: `\n${fact} This restore reverted only the latest 1 change. ${count} earlier applied change(s) in this conversation (paths: ${paths}) remain intact.`,
  })
}
