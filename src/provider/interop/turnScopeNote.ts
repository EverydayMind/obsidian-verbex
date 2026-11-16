import { L } from '../../i18n/modelText'

import { nativeToolName } from './protocol'
import type { NativeTurnScope } from './turnScope'
export function turnScopeNote(
  scope: NativeTurnScope,
  exposedToolNames: readonly string[],
): string {
  const selection = scope.scope.selection
  const reader = nativeToolName(scope.providerId, 'get_editor_context')
  return [
    L({
      ko: `제출 시 편집기 문서: ${scope.scope.path}`,
      en: `Editor document at submission: ${scope.scope.path}`,
    }),
    selection
      ? L({
          ko: `제출 시 선택 범위 있음(${Array.from(selection.text).length}자). 사용자가 "이 부분"·"선택한 곳"이라고 하면 이 선택을 뜻한다.`,
          en: `Selection present at submission (${Array.from(selection.text).length} characters). When the user says "this part" or "the selection", it refers to this selection.`,
        })
      : L({ ko: '제출 시 선택 범위 없음.', en: `No selection at submission.` }),
    ...(exposedToolNames.includes(reader)
      ? [
          L({
            ko: `선택 내용과 문서의 현재 상태는 ${reader}로 확인한다.`,
            en: `Check selection contents and current document state with ${reader}.`,
          }),
        ]
      : []),
  ].join('\n')
}
