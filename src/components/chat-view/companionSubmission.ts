import type {
  ChatSkillContextItem,
  ChatUserMessage,
  ChatWorkflowContextItem,
} from '../../types/chat'

/**
 * Reattaches the host-authored companion context when a pending skill/workflow
 * selection is confirmed. Keeping this as a pure boundary makes it explicit
 * that Proceed changes only selection metadata, never the one-shot edit scope.
 */
export function buildConfirmedSelectionMessage(
  rawInputMessage: ChatUserMessage,
  skillContext: ChatSkillContextItem[],
  workflowContext: ChatWorkflowContextItem[],
): ChatUserMessage {
  return {
    ...rawInputMessage,
    skillContext,
    workflowContext,
  }
}
