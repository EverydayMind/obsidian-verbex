import { usePlugin } from '../../contexts/plugin-context'
import type { CommitFact } from '../../provider/interop/commitStatus'
import {
  AssistantToolMessageGroup,
  ChatMessage,
  ChatToolMessage,
} from '../../types/chat'
import { summarizeToolCall } from '../../utils/chat/toolCallSummary'

import AssistantMessageAnnotations from './AssistantMessageAnnotations'
import AssistantMessageContent from './AssistantMessageContent'
import AssistantToolMessageGroupActions from './AssistantToolMessageGroupActions'
import ChatCallUsage from './ChatCallUsage'
import LargeFileStatusCard from './LargeFileStatusCard'
import ToolMessage from './ToolMessage'
import { proposalDisplayContext } from './useProposalSubmission'

function isDuplicateSummary(
  message: AssistantToolMessageGroup[number],
  next: AssistantToolMessageGroup[number] | undefined,
): boolean {
  if (message.role !== 'assistant' || next?.role !== 'tool') return false
  const call = next.toolCalls[0]
  return !!(
    message.verbexToolSummary &&
    !message.annotations &&
    !message.reasoning &&
    !message.metadata &&
    !message.verbexCallUsage?.length &&
    !message.verbexRunState &&
    !message.verbexLargeFileCard &&
    !message.verbexChangeLedger &&
    call &&
    // Conversations saved before the markdown form stored the plain one.
    (message.content ===
      summarizeToolCall(call.request, call.response, { markdown: true }) ||
      message.content === summarizeToolCall(call.request, call.response))
  )
}

export type AssistantToolMessageGroupItemProps = {
  messages: AssistantToolMessageGroup
  contextMessages: ChatMessage[]
  conversationId: string
  isApplying: boolean // TODO: isApplying should be a boolean for each assistant message
  onApply: (
    blockToApply: string,
    chatMessages: ChatMessage[],
    filename?: string,
  ) => void
  onToolMessageUpdate: (message: ChatToolMessage) => void
  onCommitUpdate: (
    messageId: string,
    callId: string,
    commit: CommitFact,
  ) => void
  allMessages: ChatMessage[]
  isStreaming: boolean
  onRunProposals: (
    calls: import('../../types/tool-call.types').ToolCallRequest[],
    labels: string[],
  ) => void
}

export default function AssistantToolMessageGroupItem({
  messages,
  contextMessages,
  conversationId,
  isApplying,
  onApply,
  onToolMessageUpdate,
  onCommitUpdate,
  allMessages,
  isStreaming,
  onRunProposals,
}: AssistantToolMessageGroupItemProps) {
  const plugin = usePlugin()
  const nativeEntries = plugin.nativeProviderHost?.getEntries() ?? []
  const proposalLabels = new Map(
    nativeEntries.map((entry) => [entry.name, entry.tool.title ?? entry.name]),
  )
  const { proposalNames, lastAssistantId } = proposalDisplayContext(
    allMessages,
    [
      ...(plugin.providerRegistry
        ?.getAgentToolDefinitions()
        .map((tool) => tool.function.name) ?? []),
      ...nativeEntries.map((entry) => entry.name),
    ],
  )
  return (
    <div className="verbex-assistant-tool-message-group">
      {messages.map((message, index) =>
        message.role === 'assistant' ? (
          isDuplicateSummary(
            message,
            messages[index + 1],
          ) ? null : message.verbexLargeFileCard ? (
            <div key={message.id} className="verbex-chat-messages-assistant">
              <LargeFileStatusCard card={message.verbexLargeFileCard} />
            </div>
          ) : message.annotations ||
            message.content ||
            message.verbexRunState ||
            message.verbexCallUsage?.length ? (
            <div key={message.id} className="verbex-chat-messages-assistant">
              {message.annotations && (
                <AssistantMessageAnnotations
                  annotations={message.annotations}
                />
              )}
              <AssistantMessageContent
                content={
                  message.verbexRunState && message.content.trim()
                    ? `${message.content}\n\n[${message.verbexRunState.label}]`
                    : message.content
                }
                contextMessages={contextMessages}
                handleApply={onApply}
                isApplying={isApplying}
                proposalNames={proposalNames}
                proposalLabels={proposalLabels}
                showProposals={!isStreaming && message.id === lastAssistantId}
                onRunProposals={onRunProposals}
              />
              <ChatCallUsage
                message={message}
                contextMessages={contextMessages}
              />
              {message.verbexRunState && (
                <div className="verbex-verbex-run-state">
                  {message.verbexRunState.label}
                  {message.verbexRunState.detail
                    ? `: ${message.verbexRunState.detail}`
                    : ''}
                </div>
              )}
            </div>
          ) : null
        ) : (
          <div key={message.id}>
            <ToolMessage
              message={message}
              conversationId={conversationId}
              onMessageUpdate={onToolMessageUpdate}
              onCommitUpdate={onCommitUpdate}
            />
          </div>
        ),
      )}
      {messages.length > 0 && (
        <AssistantToolMessageGroupActions messages={messages} />
      )}
    </div>
  )
}
