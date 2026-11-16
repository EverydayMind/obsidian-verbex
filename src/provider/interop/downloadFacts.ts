import { L } from '../../i18n/modelText'
import { coerceString } from '../../utils/coerceString'

import type { JsonObject } from './protocol'

export function fileSaveFacts(save?: JsonObject): string {
  if (!save) return ''
  const cleanup = L({
    ko: save.cleanupPending === true ? '있음' : '없음',
    en: save.cleanupPending === true ? 'yes' : 'no',
  })
  return L({
    ko: ` 다운로드 상태: ${coerceString(save.nativeDownload)}. 최종 파일 생성: ${coerceString(save.publication)}. 임시 파일 정리 대기: ${cleanup}.`,
    en: ` Download status: ${coerceString(save.nativeDownload)}. Final file publication: ${coerceString(save.publication)}. Temporary file cleanup pending: ${cleanup}.`,
  })
}
