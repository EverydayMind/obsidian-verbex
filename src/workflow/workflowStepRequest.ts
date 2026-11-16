import { L } from '../i18n/modelText'

export function workflowStepRequest(
  intentRequest: string,
  activeStepId?: string | null,
  steps?: readonly { id: string; description?: string }[],
): string {
  if (!activeStepId) return intentRequest
  const activeStepDescription =
    steps?.find((step) => step.id === activeStepId)?.description ?? activeStepId
  if (!activeStepDescription) return intentRequest
  return L({
    ko: `${intentRequest}\n[진행 중인 워크플로 단계] ${activeStepDescription}`,
    en: `${intentRequest}\n[Ongoing workflow step] ${activeStepDescription}`,
  })
}
