import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
export const VERIFICATION_FAILED_MESSAGE = (
  locale: ModelLocale = getModelLocale(),
) =>
  L(
    {
      ko: '같은 워크플로 검증 규칙을 두 번 통과하지 못해 자동 재시도를 중단했습니다. 파일은 적용되지 않았습니다. 검증 오류를 확인하거나 더 큰 tool-calling 모델로 다시 시도하세요.',
      en: `The same workflow validation rule failed twice, so automatic retries stopped. The file was not applied. Check the validation error or retry with a larger tool-calling model.`,
    },
    locale,
  )

export const NO_TOOL_EXECUTION_CLAIM_CORRECTION = (
  locale: ModelLocale = getModelLocale(),
) =>
  [
    L(
      {
        ko: `${modelMarker('systemNotice', 'ko')} 방금 응답에는 실제 tool_call이 없었습니다.`,
        en: `${modelMarker('systemNotice', 'en')} The last response contained no actual tool_call.`,
      },
      locale,
    ),
    L(
      {
        ko: '도구를 호출하지 않았는데 "도구를 사용했다", "파일을 읽었다", "frontmatter를 확인했다"라고 말한 것은 완료가 아닙니다.',
        en: `Claiming to have used a tool, read a file or checked frontmatter without calling a tool does not complete the task.`,
      },
      locale,
    ),
    L(
      {
        ko: '필요한 작업은 JSON 예시나 설명으로 대체하지 말고 실제 도구 호출로 수행하세요.',
        en: `Perform necessary work with actual tool calls, not JSON examples or explanations.`,
      },
      locale,
    ),
  ].join('\n')

export const INVALID_NO_TOOL_RESPONSE_MESSAGE = (
  locale: ModelLocale = getModelLocale(),
) =>
  L(
    {
      ko: '도구 호출을 완료하지 못했습니다. 모델이 실제 tool_call 대신 일반 텍스트를 반복해 자동 실행을 중단했습니다. 도구 호출을 지원하는 모델을 선택하거나 다시 시도하세요.',
      en: `Tool execution could not be completed. The model repeated plain text instead of actual tool_call requests, so automatic execution stopped. Choose a tool-calling model or try again.`,
    },
    locale,
  )

export const ITERATION_BUDGET_MESSAGE = (
  locale: ModelLocale = getModelLocale(),
) =>
  L(
    {
      ko: '자동 반복 한도에 도달하여 작업을 완료하지 못했습니다. 반복 한도를 높이거나 대화를 이어서 진행하세요.',
      en: `The task could not be completed within the automatic iteration limit. Increase the limit or continue the conversation.`,
    },
    locale,
  )
