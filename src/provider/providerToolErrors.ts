import { L } from '../i18n/modelText'

export function requiredToolBudgetError(names: readonly string[]): string {
  return L({
    ko: `TOOL_BUDGET_EXCEEDED: 플러그인 필수 도구 묶음이 노출 예산을 넘었습니다: ${names.join(', ')}. 고정 도구나 Skill 선택을 줄이세요.`,
    en: `TOOL_BUDGET_EXCEEDED: Required plugin tool bundle exceeds the exposure budget: ${names.join(', ')}. Reduce pinned tools or selected Skills.`,
  })
}

export function missingRequiredToolsError(names: readonly string[]): string {
  return L({
    ko: `필수 도구를 제공할 수 없습니다: ${names.join(', ')}. 도구의 연결·승인·노출 예산 또는 Skill/workflow 선택을 확인하세요.`,
    en: `Cannot provide required tools: ${names.join(', ')}. Check tool connections, approval, exposure budget or Skill/workflow selection.`,
  })
}

export function assertRequiredToolBudget(names: readonly string[]): void {
  if (names.length) throw new Error(requiredToolBudgetError(names))
}
export function assertRequiredToolsAvailable(names: readonly string[]): void {
  if (names.length) throw new Error(missingRequiredToolsError(names))
}
