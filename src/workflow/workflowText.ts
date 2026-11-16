import type { ModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'

export function predecessorOutput(
  p0: string | number,
  p1: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `## 선행 단계 산출물: ${p0}
${p1}`,
      en: `## Predecessor step output: ${p0}
${p1}`,
    },
    locale,
  )
}
export function activeWorkflowHeading(locale?: ModelLocale) {
  return L(
    { ko: '# 활성 Verbex Workflow 단계', en: '# Active Verbex Workflow step' },
    locale,
  )
}

export function workflowGoal(p0: string | number, locale?: ModelLocale) {
  return L(
    { ko: `고정된 전체 목표: ${p0}`, en: `Fixed overall goal: ${p0}` },
    locale,
  )
}

export function turnRequest(p0: string | number, locale?: ModelLocale) {
  return L(
    { ko: `이번 턴 요청: ${p0}`, en: `Request for this turn: ${p0}` },
    locale,
  )
}

export function currentStep(
  p0: string | number,
  p1: string | number,
  locale?: ModelLocale,
) {
  return L(
    { ko: `현재 단계: ${p0} (${p1})`, en: `Current step: ${p0} (${p1})` },
    locale,
  )
}

export function stepDescription(p0: string | number, locale?: ModelLocale) {
  return L({ ko: `단계 설명: ${p0}`, en: `Step description: ${p0}` }, locale)
}

export function stepPrompt(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `단계 프롬프트:
${p0}`,
      en: `Step prompt:
${p0}`,
    },
    locale,
  )
}

export function verificationContract(
  p0: string | number,
  locale?: ModelLocale,
) {
  return L(
    { ko: `출력 검증 계약: ${p0}`, en: `Output verification contract: ${p0}` },
    locale,
  )
}

export function currentStepInstruction(locale?: ModelLocale) {
  return L(
    {
      ko: '현재 단계는 Controller가 확정했습니다. 단계 이름을 다시 선택하거나 [MAP]/[REVIEW] 같은 단계 선언을 출력하지 말고 현재 단계 작업만 수행하세요.',
      en: "The Controller has fixed the current step. Perform only the current step's work; do not select a step name again or output step declarations such as [MAP]/[REVIEW].",
    },
    locale,
  )
}

export function coverageComplete(locale?: ModelLocale) {
  return L(
    {
      ko: '## 조문 coverage\n모든 조문 범위의 검토가 완료되었습니다.',
      en: '## Article coverage\nReview of all article ranges is complete.',
    },
    locale,
  )
}

export function coverageProgress(
  p0: string | number,
  p1: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `## 조문 coverage (${p0}/${p1} 완료)`,
      en: `## Article coverage (${p0}/${p1} complete)`,
    },
    locale,
  )
}

export function controllerCursor(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  p3: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `현재 Controller 커서: ${p0} L${p1}-L${p2} · ${p3}`,
      en: `Current Controller cursor: ${p0} L${p1}-L${p2} · ${p3}`,
    },
    locale,
  )
}

export function coverageInstruction(locale?: ModelLocale) {
  return L(
    {
      ko: '아래 범위만 이번 턴에 검토하고, 정확 인용은 줄번호를 제외한 원문과 완전히 일치시켜야 합니다. 다음 단계로 넘어가지 마세요.',
      en: 'Review only the range below in this turn. Exact quotations must match the original text byte for byte, excluding line numbers. Do not proceed to the next step.',
    },
    locale,
  )
}

export function quoteEllipsis(locale?: ModelLocale) {
  return L(
    {
      ko: '정확 인용 열에 생략부호가 포함되어 있습니다.',
      en: 'The exact quotation column contains an ellipsis.',
    },
    locale,
  )
}

export function quoteMismatch(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `정확 인용이 현재 Controller 범위의 원문과 일치하지 않습니다: ${p0}`,
      en: `The exact quotation does not match the original text in the current Controller range: ${p0}`,
    },
    locale,
  )
}

export function noProblemRow(locale?: ModelLocale) {
  return L(
    {
      ko: '문제가 없는 행은 상세 검토 표에서 제외해야 합니다.',
      en: 'Rows without a problem must be excluded from the detailed review table.',
    },
    locale,
  )
}

export function noCorrectionRow(locale?: ModelLocale) {
  return L(
    {
      ko: '수정안이 없는 행은 상세 검토 표에서 제외해야 합니다.',
      en: 'Rows without a correction must be excluded from the detailed review table.',
    },
    locale,
  )
}

export function completionWarning(p0: string | number, locale?: ModelLocale) {
  return L({ ko: `[주의 필요] ${p0}`, en: `[Attention needed] ${p0}` }, locale)
}

export function stepIncomplete(p0: string | number, locale?: ModelLocale) {
  return L({ ko: `[단계 미완료] ${p0}`, en: `[Step incomplete] ${p0}` }, locale)
}

export function continueStep(locale?: ModelLocale) {
  return L(
    {
      ko: '다음 턴에도 현재 단계를 유지합니다. checklist_next로 이어서 처리하십시오.',
      en: 'Keep the current step in the next turn. Continue with checklist_next.',
    },
    locale,
  )
}

export function missingArtifact(p0: string | number, locale?: ModelLocale) {
  return L(
    { ko: `필수 artifact 없음: ${p0}`, en: `Required artifact missing: ${p0}` },
    locale,
  )
}

export function missingIndexArtifact(locale?: ModelLocale) {
  return L(
    {
      ko: 'build_review_index 미실행: index_folder artifact 없음',
      en: 'build_review_index not executed: index_folder artifact missing',
    },
    locale,
  )
}

export function checklistFailure(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `체크리스트 확인 실패: ${p0}`,
      en: `Checklist verification failed: ${p0}`,
    },
    locale,
  )
}
