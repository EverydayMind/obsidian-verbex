import {
  type AgentToolOutcome,
  toolFailed,
  toolSucceeded,
} from '../../core/llm/toolOutcome'
import { L } from '../../i18n/modelText'

import { receiptObservedText } from './browserObserved'
import { createdTabText } from './browserOutcomeText'
import { fileSaveFacts } from './downloadContract'
import type { JsonObject, JsonValue } from './protocol'

export type ReceiptClass = 'applied' | 'not_dispatched' | 'not_applied'

export function receiptOutcome(
  kind: ReceiptClass,
  operationId: string,
  observed?: JsonValue,
  createdTarget?: JsonObject,
  fileSave?: JsonObject,
): AgentToolOutcome {
  const facts = receiptObservedText(observed) + fileSaveFacts(fileSave)
  const created = createdTabText(createdTarget)
  return kind === 'applied'
    ? toolSucceeded(
        L({
          ko: '브라우저 입력이 적용되었습니다. 외부 업무의 성공 여부는 확인되지 않았습니다.',
          en: 'Browser input was applied. External task success has not been confirmed.',
        }) +
          facts +
          created,
        {
          mutation: 'applied',
          mutationScope: 'browser',
          mutationKey: `browser:${operationId}`,
          retry: { allowed: false },
        },
      )
    : toolFailed(
        L({
          ko: '브라우저 동작이 적용되지 않았습니다. 자동 재실행하지 않습니다.',
          en: 'The browser action was not applied. It will not be retried automatically.',
        }) + facts,
        {
          mutationScope: kind === 'not_dispatched' ? 'none' : 'browser',
          retry: { allowed: false },
        },
      )
}

export function unknownOutcome(
  operationId: string,
  partialClickReported = false,
): AgentToolOutcome {
  const partial = partialClickReported
    ? L({
        ko: 'Provider가 일부 클릭 입력을 보고했으며 클릭이 발생했을 수 있습니다. ',
        en: 'The provider reported some click input; clicks may have occurred. ',
      })
    : ''
  return {
    status: 'paused',
    terminal: true,
    mutation: 'unknown',
    mutationScope: 'browser',
    mutationKey: `browser:${operationId}`,
    retry: { allowed: false },
    displayText: L({
      ko: `브라우저 동작의 적용 여부를 확인할 수 없습니다. 작업 ${operationId}. ${partial}사이트에서 직접 확인하세요. 자동 재실행하지 않습니다. 명령 팔레트의 "Review unresolved browser operations"에서 provider 기록(입력 전송 여부)을 보고 사람이 차단을 해제할 수 있습니다.`,
      en: `Cannot confirm whether the browser action was applied. Operation ${operationId}. ${partial}Check the site directly. It will not be retried automatically. A person can review provider records (whether input was dispatched) and clear the block using "Review unresolved browser operations" in the command palette.`,
    }),
  }
}
