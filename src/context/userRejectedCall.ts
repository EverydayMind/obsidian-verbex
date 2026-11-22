import type { AgentToolOutcome } from '../core/llm/toolOutcome'
import { modelMarker } from '../i18n/modelMarkers'
import { L } from '../i18n/modelText'
import type { ToolCallRequest } from '../types/tool-call.types'

import { repeatedToolCallKey } from './repeatedToolCalls'

export function hasDuplicateCalls(calls: ToolCallRequest[]): boolean {
  return new Set(calls.map(repeatedToolCallKey)).size !== calls.length
}

export class UserRejectedCalls {
  private readonly keys = new Set<string>()

  blocked(call: ToolCallRequest): boolean {
    return this.keys.has(repeatedToolCallKey(call))
  }

  note(call: ToolCallRequest, outcome: AgentToolOutcome): void {
    if (outcome.userRejected) this.keys.add(repeatedToolCallKey(call))
  }

  batchItem(
    call: ToolCallRequest,
    record: (
      call: ToolCallRequest,
      outcome: AgentToolOutcome,
    ) => AgentToolOutcome,
  ) {
    return {
      call,
      verificationFailure: undefined,
      result: {
        kind: 'outcome' as const,
        outcome: record(call, blockedUserRejectedCall()),
      },
    }
  }
}

export function blockedUserRejectedCall(): AgentToolOutcome {
  return {
    status: 'rejected',
    terminal: true,
    mutation: 'none',
    mutationScope: 'vault',
    userRejected: true,
    displayText: L({
      ko: `이 턴에서 사용자가 이미 거절한 변경과 같아 다시 묻지 않았습니다. 파일은 바뀌지 않았습니다.\n${modelMarker('harnessFact', 'ko')} 사용자가 이 변경을 거절했습니다. 파일은 바뀌지 않았습니다. 같은 변경이나 표현만 바꾼 변경을 다시 제안하지 마십시오. 다른 변경이 필요한지 모르면 먼저 사용자에게 물으십시오.`,
      en: `This change matches one the user already rejected this turn, so approval was not requested again. The file was not changed.\n${modelMarker('harnessFact', 'en')} The user rejected this change. The file was not changed. Do not propose the same change or a reworded version again. If you do not know whether another change is needed, ask the user first.`,
    }),
  }
}
