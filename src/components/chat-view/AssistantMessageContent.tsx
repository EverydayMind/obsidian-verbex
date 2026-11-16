import React, { useCallback, useMemo, useRef, useState } from 'react'

import { t } from '../../i18n'
import { ChatAssistantMessage, ChatMessage } from '../../types/chat'
import type { ToolCallRequest } from '../../types/tool-call.types'
import {
  ParsedTagContent,
  parseTagContents,
} from '../../utils/chat/parse-tag-content'
import { parseToolProposals } from '../../utils/chat/parse-tool-proposals'
import { uuidv4 } from '../../utils/uuid'

import MarkdownCodeComponent from './MarkdownCodeComponent'
import MarkdownReferenceBlock from './MarkdownReferenceBlock'
import { ObsidianMarkdown } from './ObsidianMarkdown'

export default function AssistantMessageContent({
  content,
  contextMessages,
  handleApply,
  isApplying,
  proposalNames,
  proposalLabels,
  showProposals,
  onRunProposals,
}: {
  content: ChatAssistantMessage['content']
  contextMessages: ChatMessage[]
  handleApply: (
    blockToApply: string,
    chatMessages: ChatMessage[],
    filename?: string,
  ) => void
  isApplying: boolean
  proposalNames: ReadonlySet<string>
  proposalLabels: ReadonlyMap<string, string>
  showProposals: boolean
  onRunProposals: (calls: ToolCallRequest[], labels: string[]) => void
}) {
  const [submitted, setSubmitted] = useState(false)
  const submittedRef = useRef(false)
  const proposals = showProposals
    ? parseToolProposals(content, proposalNames)
    : []
  const onApply = useCallback(
    (blockToApply: string, filename?: string) => {
      handleApply(blockToApply, contextMessages, filename)
    },
    [handleApply, contextMessages],
  )

  return (
    <>
      <AssistantTextRenderer onApply={onApply} isApplying={isApplying}>
        {content}
      </AssistantTextRenderer>
      {proposals.length > 0 && (
        <div className="verbex-code-block">
          <div className="verbex-code-block-header-title">
            {t('ui.AssistantMessageContent.unexecutedProposal')}
          </div>
          {proposals.map((proposal, index) => (
            <div key={index}>
              <strong>
                {proposalLabels.get(proposal.name) ?? proposal.name}
              </strong>
              : {JSON.stringify(proposal.arguments).slice(0, 200)}
            </div>
          ))}
          <button
            className="mod-cta"
            disabled={submitted}
            onClick={() => {
              if (submittedRef.current) return
              submittedRef.current = true
              setSubmitted(true)
              onRunProposals(
                proposals.map((proposal) => ({
                  id: uuidv4(),
                  name: proposal.name,
                  arguments: JSON.stringify(proposal.arguments),
                })),
                proposals.map(
                  (proposal) =>
                    proposalLabels.get(proposal.name) ?? proposal.name,
                ),
              )
            }}
          >
            {t('ui.AssistantMessageContent.run')}
          </button>
        </div>
      )}
    </>
  )
}

const AssistantTextRenderer = React.memo(function AssistantTextRenderer({
  onApply,
  isApplying,
  children,
}: {
  onApply: (blockToApply: string, filename?: string) => void
  children: string
  isApplying: boolean
}) {
  const blocks: ParsedTagContent[] = useMemo(
    () => parseTagContents(children),
    [children],
  )

  return (
    <>
      {blocks.map((block, index) =>
        block.type === 'string' ? (
          <div key={index}>
            <ObsidianMarkdown
              content={block.content}
              scale="sm"
              linkifyFileMentions
            />
          </div>
        ) : block.type === 'think' ? null : block.startLine &&
          block.endLine &&
          block.filename ? (
          <MarkdownReferenceBlock
            key={index}
            filename={block.filename}
            startLine={block.startLine}
            endLine={block.endLine}
          />
        ) : (
          <MarkdownCodeComponent
            key={index}
            onApply={onApply}
            isApplying={isApplying}
            language={block.language}
            filename={block.filename}
            title="verbex_block"
            defaultCollapsed
          >
            {block.content}
          </MarkdownCodeComponent>
        ),
      )}
    </>
  )
})
