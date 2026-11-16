import type { TFile } from 'obsidian'

import { filterAvailableSkills } from '../../skills/skillAvailability'
import { SkillRouter } from '../../skills/SkillRouter'
import { contextTypeFromExtension } from '../../skills/skillScope'
import type { ChatMessage, ChatUserMessage } from '../../types/chat'
import { buildGuideInstructions } from '../../utils/chat/guideInstructions'
import {
  chatMessagesToPriorDocumentPaths,
  chatMessagesToPriorToolResults,
  chatMessagesToRequestHistory,
} from '../../utils/chat/request-history'

/**
 * The data half of one chat submission, frozen at submit time: request text,
 * prior transcript, the message's selections and the active note. Callbacks,
 * abort and UI wiring stay with the stream manager.
 */
export function buildChatSubmissionSnapshot(input: {
  conversationId: string
  chatMessages: ChatMessage[]
  lastMessage: ChatUserMessage
  request: string
  currentFile: TFile | null
  maxIterations: number
  isPluginEnabled?: (id: string) => boolean
}) {
  const { chatMessages, lastMessage, currentFile } = input
  const contextType = contextTypeFromExtension(currentFile?.extension)
  const routedSkills = SkillRouter.filterActiveSkills(
    lastMessage.skillContext,
    lastMessage.workflowContext,
    contextType,
  )
  const { activeSkills, excludedSkills, excludedSkillDetails } =
    filterAvailableSkills(routedSkills, input.isPluginEnabled ?? (() => true))
  const submittedIndex = chatMessages.findIndex(
    (message) => message.id === lastMessage.id,
  )
  return {
    runId: `chat-${input.conversationId}`,
    conversationId: input.conversationId,
    submittedTurnId: lastMessage.id,
    previousSubmittedTurnId:
      submittedIndex < 0
        ? undefined
        : chatMessages
            .slice(0, submittedIndex)
            .filter((message) => message.role === 'user')
            .at(-1)?.id,
    request: input.request,
    isContinuationSignal: lastMessage.isContinuation === true,
    history: chatMessagesToRequestHistory(chatMessages),
    priorToolResults: chatMessagesToPriorToolResults(chatMessages),
    priorDocumentPaths: chatMessagesToPriorDocumentPaths(chatMessages),
    currentFile,
    mentionables: lastMessage.mentionables,
    companionScope: lastMessage.companionScope,
    browserContext: lastMessage.browserContext,
    pinnedConnectorTools: lastMessage.pinnedConnectorTools,
    excludedToolNames: lastMessage.excludedToolNames,
    contextModeOverride: lastMessage.contextModeOverride,
    skillInstructions: buildGuideInstructions(
      activeSkills,
      lastMessage.workflowContext,
      contextType,
    ),
    workflowContext: lastMessage.workflowContext,
    activeSkills,
    excludedSkills,
    excludedSkillDetails,
    maxIterations: input.maxIterations,
  }
}
