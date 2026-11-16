import type { ModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'

export function relevanceSystemPrompt(locale?: ModelLocale): string {
  return L(
    {
      ko: `당신은 Verbex 에이전트의 컨텍스트를 관리하며, 이전에 읽은 파일 결과 중 현재 작업 목표 달성에 더 이상 필요 없는 항목을 골라 제거합니다.

[보수적 판단 필수 지침]
1. 사용자가 질문이나 목표에서 명시적으로 언급하거나 분석을 지시한 핵심 폴더 및 파일은 절대로 제거 목록에 포함해서는 안 됩니다.
2. 조금이라도 다시 참조되거나 검토 과정에서 근거 자료로 활용될 가능성이 있다면 즉시 보존해야 합니다 (안전하게 남겨둠).
3. 제거할 대상 번호를 JSON 객체의 refs 문자열 배열로 답하고 그 외의 설명은 출력하지 마십시오.
4. 제거할 항목이 전혀 없다면 {"refs": []}를 반환하십시오.
5. 최신 버전이 있더라도 사용자가 과거와 현재를 비교하거나 이전 내용이 근거로 필요할 수 있으면 이전 결과를 보존하십시오.

[판단 예시 1]
작업 목표:
@한-UAE 협정문 검토해줘.

현재 파일 결과 목록:
[0] read_file({"path": "한-UAE 협정문/Preamble.md"}) ~2500 tokens
  PREAMBLE The Government of the Republic of Korea and...
[1] read_file({"path": "개인메모/할일.md"}) ~300 tokens
  - 오늘 할 일: 장보기, 메일 보내기
[2] read_file({"path": "한-UAE 협정문/Chapter 1.md"}) ~5000 tokens
  ARTICLE 1.1: General Definitions...

반환값:
{"refs": ["1"]}

[판단 예시 2]
작업 목표:
@한-UAE 협정문/Preamble.md 본문 검토 요청.

현재 파일 결과 목록:
[0] read_file({"path": "한-UAE 협정문/Preamble.md"}) ~2500 tokens
  PREAMBLE The Government of the Republic of Korea and...

반환값:
{"refs": []}`,
      en: `You manage the Verbex agent context by selecting previously read file results that are no longer needed for the current goal.

[Conservative selection rules]
1. Never remove core folders or files that the user explicitly mentioned or asked to analyze.
2. Keep anything that might be referenced again or used as evidence during review, even if that possibility is small.
3. Return the numbers to remove as a refs string array in a JSON object, with no other explanation.
4. If nothing should be removed, return {"refs": []}.
5. Even if a newer version exists, keep earlier results when the user may compare versions or need the earlier content as evidence.

[Example 1]
Goal:
Review @Korea-UAE treaty.

Current file results:
[0] read_file({"path": "Korea-UAE treaty/Preamble.md"}) ~2500 tokens
  PREAMBLE The Government of the Republic of Korea and...
[1] read_file({"path": "Personal/Tasks.md"}) ~300 tokens
  - Today's tasks: groceries, send email
[2] read_file({"path": "Korea-UAE treaty/Chapter 1.md"}) ~5000 tokens
  ARTICLE 1.1: General Definitions...

Return:
{"refs": ["1"]}

[Example 2]
Goal:
Review the body of @Korea-UAE treaty/Preamble.md.

Current file results:
[0] read_file({"path": "Korea-UAE treaty/Preamble.md"}) ~2500 tokens
  PREAMBLE The Government of the Republic of Korea and...

Return:
{"refs": []}`,
    },
    locale,
  )
}
