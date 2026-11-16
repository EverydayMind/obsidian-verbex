import { SerializedEditorState } from 'lexical'

import { ChatMessage, ChatUserMessage } from '../../types/chat'
import { Mentionable } from '../../types/mentionable'

import ChatUserInput, { ChatUserInputRef } from './chat-input/ChatUserInput'
import UserMessageActions from './chat-input/UserMessageActions'
import ChatCallUsage from './ChatCallUsage'
import SkillContextResults from './SkillContextResults'
import WorkflowContextResults from './WorkflowContextResults'

export type UserMessageItemProps = {
  message: ChatUserMessage
  contextMessages: ChatMessage[]
  chatUserInputRef: (ref: ChatUserInputRef | null) => void
  onInputChange: (content: SerializedEditorState) => void
  onSubmit: (content: SerializedEditorState) => void
  onFocus: () => void
  onMentionablesChange: (mentionables: Mentionable[]) => void
  onToggleSkill: (name: string) => void
  onToggleWorkflow: (id: string) => void
  onResubmitWithSelectedContext: () => void
}

export default function UserMessageItem({
  message,
  contextMessages,
  chatUserInputRef,
  onInputChange,
  onSubmit,
  onFocus,
  onMentionablesChange,
  onToggleSkill,
  onToggleWorkflow,
  onResubmitWithSelectedContext,
}: UserMessageItemProps) {
  return (
    <div className="verbex-chat-messages-user">
      <ChatUserInput
        ref={chatUserInputRef}
        initialSerializedEditorState={message.content}
        onChange={onInputChange}
        onSubmit={onSubmit}
        onFocus={onFocus}
        mentionables={message.mentionables}
        setMentionables={onMentionablesChange}
        variant="historical"
        modelId={message.modelId}
        extraControls={<UserMessageActions message={message} />}
      />
      <ChatCallUsage message={message} contextMessages={contextMessages} />
      <SkillContextResults
        skillContext={message.skillContext ?? []}
        onToggleSkill={onToggleSkill}
        onResubmit={onResubmitWithSelectedContext}
      />
      <WorkflowContextResults
        workflowContext={message.workflowContext ?? []}
        onToggleWorkflow={onToggleWorkflow}
        onResubmit={onResubmitWithSelectedContext}
      />
    </div>
  )
}
