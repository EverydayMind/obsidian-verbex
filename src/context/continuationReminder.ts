import { L } from '../i18n/modelText'
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function selectionReminder(
  request: string,
  intentRequest: string,
  lastAssistantText: string,
): string {
  const question = lastAssistantText.trim()
  const half = SELECTION_CONTEXT_CHARS / 2
  const excerpt =
    question.length > SELECTION_CONTEXT_CHARS
      ? L({
          ko: `${question.slice(0, half)}\n[중간 생략 — 직전 응답 전체가 아님]\n${question.slice(-half)}`,
          en: `${question.slice(0, half)}\n[Middle omitted — not the entire previous response]\n${question.slice(-half)}`,
        })
      : question
  return L({
    ko: `(직전 assistant 질문에 대한 사용자 선택: "${oneLine(request)}")\n직전 assistant 응답:\n${excerpt}\n직전 질문과 상위 과업을 함께 고려해 선택을 해석하세요. 의미가 분명하면 다음 작업을 진행하고 같은 확인을 다시 묻지 마세요. 결과를 바꿀 정도로 중요한 의미가 불명확할 때만 그 부분을 확인하세요. 상위 과업: "${oneLine(intentRequest).slice(0, 200)}"\n\n`,
    en: `(User selection for the previous assistant question: "${oneLine(request)}")\nPrevious assistant response:\n${excerpt}\nInterpret the selection in light of the previous question and the overall task. If clear, proceed without asking the same question again. Clarify only ambiguity that could materially change the result. Overall task: "${oneLine(intentRequest).slice(0, 200)}"\n\n`,
  })
}

export const QUESTION_TAIL_CHARS = 400

export const SELECTION_CONTEXT_CHARS = 1600

export function continuationReminder(
  selection: boolean,
  request: string,
  plan: { bareContinuation: boolean; intentRequest: string },
  workflowActive: boolean,
  lastAssistantText: string,
): string {
  return selection
    ? selectionReminder(request, plan.intentRequest, lastAssistantText)
    : plan.bareContinuation
      ? L({
          ko: `(진행 중 과업: "${oneLine(plan.intentRequest).slice(0, 200)}") — 이 과업의 다음 단계를 이어서 수행하고 새 과업을 시작하지 마세요. 사용자는 이미 진행을 승인했으니 같은 확인을 다시 묻지 말고 도구를 호출하세요(파일 저장은 승인 화면에서 따로 확인됩니다).${!workflowActive && lastAssistantText.trim() ? `\n직전 assistant 응답(끝부분): "${oneLine(lastAssistantText).slice(-QUESTION_TAIL_CHARS)}"\n진행 지시는 직전 응답에서 제안한 후속 작업에도 적용됩니다. 이전 도구 결과를 확인하고, 필요한 식별자는 사용 가능한 검색·탐색 도구로 찾으세요.` : ''}\n\n`,
          en: `(Ongoing task: "${oneLine(plan.intentRequest).slice(0, 200)}") — Continue the next step of this task; do not start a new task. The user has already approved proceeding, so call tools without repeating the same confirmation (file saves are confirmed separately in the approval screen).${!workflowActive && lastAssistantText.trim() ? `\nPrevious assistant response (tail): "${oneLine(lastAssistantText).slice(-QUESTION_TAIL_CHARS)}"\nThe instruction to proceed also applies to follow-up work proposed in the previous response. Check earlier tool results and find required identifiers with available search/discovery tools.` : ''}\n\n`,
        })
      : ''
}
