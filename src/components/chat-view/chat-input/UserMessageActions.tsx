import * as Popover from '@radix-ui/react-popover'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Check, CopyIcon, Info, Paperclip, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { ChatUserMessage } from '../../../types/chat'

import { editorStateToPlainText } from './utils/editor-state-to-plain-text'

function CopyButton({ message }: { message: ChatUserMessage }) {
  const [copied, setCopied] = useState(false)

  const content = useMemo(
    () => (message.content ? editorStateToPlainText(message.content) : ''),
    [message.content],
  )

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
    }, 1500)
  }

  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={
              copied
                ? undefined
                : () => {
                    void handleCopy()
                  }
            }
            className="clickable-icon"
          >
            {copied ? <Check size={12} /> : <CopyIcon size={12} />}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="verbex-tooltip-content">
            Copy message
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

function UserMessageInfoPopover({ message }: { message: ChatUserMessage }) {
  const { settings } = useSettings()

  const includedSkills = (message.skillContext ?? []).filter(
    (skill) => skill.included,
  )
  const includedWorkflows = (message.workflowContext ?? []).filter(
    (workflow) => workflow.included,
  )

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="clickable-icon">
          <Info size={12} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="verbex-popover-content verbex-llm-info-content">
          <div className="verbex-llm-info-header">Query Information</div>
          <div className="verbex-llm-info-footer-row">
            <span>Model:</span>
            <span className="verbex-llm-info-footer-value verbex-llm-info-model">
              {message.modelId ?? settings.chatModelId}
            </span>
          </div>
          <div className="verbex-llm-info-footer-row">
            <Paperclip className="verbex-llm-info-icon--footer" />
            <span>Attached context:</span>
            <span className="verbex-llm-info-footer-value">
              {message.mentionables.length}
            </span>
          </div>
          <div className="verbex-llm-info-footer-row">
            <Wand2 className="verbex-llm-info-icon--footer" />
            <span>Skills:</span>
            <span className="verbex-llm-info-footer-value">
              {includedSkills.length > 0
                ? includedSkills.map((skill) => skill.name).join(', ')
                : 'None'}
            </span>
          </div>
          <div className="verbex-llm-info-footer-row">
            <Wand2 className="verbex-llm-info-icon--footer" />
            <span>Workflow:</span>
            <span className="verbex-llm-info-footer-value">
              {includedWorkflows.length > 0
                ? includedWorkflows
                    .map((workflow) => workflow.name || workflow.id)
                    .join(', ')
                : 'None'}
            </span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ViewDetailButton({ message }: { message: ChatUserMessage }) {
  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div>
            <UserMessageInfoPopover message={message} />
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="verbex-tooltip-content">
            View details
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export default function UserMessageActions({
  message,
}: {
  message: ChatUserMessage
}) {
  return (
    <div className="verbex-user-message-actions">
      <ViewDetailButton message={message} />
      <CopyButton message={message} />
    </div>
  )
}
