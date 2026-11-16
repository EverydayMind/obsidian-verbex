import { ContextBudgetExceededError } from '../../context/requestPreflight'
import { ChatInputBudgetError } from '../../core/llm/budgetGate'
import { ChatModelNotReadyError } from '../../core/llm/ChatModelNotReadyError'
import { formatChatModelReadinessMessage } from '../../core/llm/modelReadiness'
import { ToolSupportRequiredError } from '../../core/llm/ToolSupportRequiredError'
import { t } from '../../i18n'

export function formatAgentErrorForUser(error: unknown): string {
  if (error instanceof ChatInputBudgetError) {
    return error.kind === 'split_required'
      ? t('ui.formatAgentErrorForUser.theInputDocumentExceedsTheModelS')
      : t(
          'ui.formatAgentErrorForUser.requiredInputExceedsTheModelBudgetAbout',
          { p0: error.estimatedTokens, p1: error.inputBudget },
        )
  }
  if (error instanceof ContextBudgetExceededError) {
    return t(
      'ui.formatAgentErrorForUser.contextStillExceedsTheLimitAfterSafe',
      { p0: error.estimatedTokens, p1: error.budgetTokens },
    )
  }
  if (error instanceof ToolSupportRequiredError) {
    return t('ui.formatAgentErrorForUser.modelIsNotConfiguredToSupportTool', {
      p0: error.modelId,
    })
  }
  if (error instanceof ChatModelNotReadyError) {
    return formatChatModelReadinessMessage(error.readiness)
  }
  return error instanceof Error
    ? error.message
    : t('ui.formatAgentErrorForUser.anUnknownErrorOccurredWhileGeneratingThe')
}
