import { L } from '../i18n/modelText'
import type { JsonObject } from '../provider/interop/protocol'
import { coerceString } from '../utils/coerceString'
export function documentJobV2Rules(contract: JsonObject): string {
  return [
    L({
      ko: 'roles의 앞 글자 대응과 reference_excerpt를 참고하고 본보기 전체는 reference_text_path에서 읽으세요. 기호 글자와 Markdown 목록을 쓰지 마세요.',
      en: `Refer to the leading-character mapping in roles and reference_excerpt; read the full exemplar from reference_text_path. Do not use symbol characters or Markdown lists.`,
    }),
    L({
      ko: `초안 규칙: ${coerceString(contract.syntax_guidance)}`,
      en: `Draft rules: ${coerceString(contract.syntax_guidance)}`,
    }),
    typeof contract.frontmatter === 'string'
      ? L({
          ko: `초안은 다음 frontmatter로 시작하고 META 값을 새 문서에 맞게 바꿉니다:\n${contract.frontmatter}`,
          en: `Start the draft with the following frontmatter and update META values for the new document:\n${contract.frontmatter}`,
        })
      : '',
    L({
      ko: '분해를 저장한 작업의 초안 경로에 쓰면 호스트가 `hwpx-dialect`·`hwpx-template`를 맞춥니다.',
      en: `When writing to the draft path of the job with a saved decomposition, the host sets \`hwpx-dialect\` and \`hwpx-template\`.`,
    }),
    L({
      ko: '새 문서 내용은 요청 주제의 근거(사용자 자료·조사 결과)로 작성하고, 샘플·본보기의 사실·수치·고유 문구는 옮기지 마세요. 자리표시 문장만 두면 draft_empty로 거절됩니다.',
      en: `Write new content using evidence for the requested topic (user materials and research). Do not copy facts, numbers or distinctive wording from the sample/exemplar. Placeholder-only drafts are rejected as draft_empty.`,
    }),
  ]
    .filter(Boolean)
    .join(' ')
}
