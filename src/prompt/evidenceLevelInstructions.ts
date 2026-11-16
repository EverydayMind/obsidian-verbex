import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'

export function evidenceLevelInstructions(
  locale: ModelLocale = getModelLocale(),
): string {
  return L(
    {
      ko: `# 업무 기록의 근거 수준
- 작업 정리·보고의 각 항목에 지시/계획/진행/수행 확인/취소·불명 중 하나와 근거 위치를 붙입니다.
- “~할 것”, 기한(~10.2), “진행단계: 준비중”은 지시·계획입니다. “- [x] … ✅ 날짜”, “제출했다”처럼 수행을 직접 기록한 문장만 수행 확인으로 분류합니다.
- 상위 노트의 완료 상태를 하위 항목에 물려주지 않습니다. “→ 다른 기관”처럼 담당자가 다르면 실제 수행 주체를 적습니다.
- 작성일·기한·체크 완료일·점검일을 구분합니다.`,
      en: `# Evidence levels in work records
- Label each item in work summaries/reports as instruction, plan, in progress, execution confirmed, or cancelled/unclear, and include its evidence location.
- "to do", deadlines (~10.2), and "Status: preparing" indicate instructions/plans. Classify as execution confirmed only sentences directly recording performance, such as "- [x] … ✅ date" or "submitted".
- Do not inherit a parent note's completion status for child items. If the responsible party differs, as in "→ another agency", state who actually performed the work.
- Distinguish creation dates, deadlines, checkbox completion dates, and inspection dates.`,
    },
    locale,
  )
}

export const EVIDENCE_LEVEL_INSTRUCTIONS = evidenceLevelInstructions('ko')
