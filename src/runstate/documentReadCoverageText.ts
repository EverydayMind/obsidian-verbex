import type { DocumentReadFact } from '../core/large-document/documentReadProgress'
import { L } from '../i18n/modelText'

/** Coverage line for a read that is unknown or invalidated; `ui` may name the cause. */
export function unconfirmedCoverageText(
  shown: string,
  fact: DocumentReadFact,
  audience: 'model' | 'ui',
): string {
  const own = audience === 'ui' && fact.invalidatedBy === 'own_write'
  return L({
    ko: `읽기 범위: ${shown} — ${fact.state === 'invalidated' ? (audience === 'ui' ? (own ? '이 턴에서 읽은 뒤 수정함' : '읽은 뒤 파일이 바뀌어 앞서 읽은 내용은 최신이 아닙니다') : '읽기 범위 무효화; 재확인 필요') : '전체 범위 미확인'}`,
    en: `Read coverage: ${shown} — ${fact.state === 'invalidated' ? (audience === 'ui' ? (own ? 'changed by this turn after it was read' : 'the file changed after it was read, so the earlier read is out of date') : 'read coverage invalidated; recheck required') : 'full coverage unconfirmed'}`,
  })
}
