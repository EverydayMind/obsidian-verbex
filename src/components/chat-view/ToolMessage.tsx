import clsx from 'clsx'
import { Check, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'

import { useMcp } from '../../contexts/mcp-context'
import { usePlugin } from '../../contexts/plugin-context'
import { t } from '../../i18n'
import type { CommitFact } from '../../provider/interop/commitStatus'
import { resolveSavedAnchorCandidates } from '../../provider/interop/resolveSavedAnchorCandidates'
import { resolveSavedAnchorRefs } from '../../provider/interop/resolveSavedAnchorRefs'
import { revealSavedAnchorCandidate } from '../../provider/interop/revealSavedAnchorCandidate'
import { savedOutputAnchorView } from '../../provider/interop/savedOutputAnchorView'
import { ChatToolMessage } from '../../types/chat'
import {
  ToolCallRequest,
  ToolCallResponse,
  ToolCallResponseStatus,
} from '../../types/tool-call.types'
import { summarizeToolCall } from '../../utils/chat/toolCallSummary'

import CommitCard from './CommitCard'
import DiagnosticSessionEditCard from './DiagnosticSessionEditCard'
import { ObsidianCodeBlock } from './ObsidianMarkdown'

export const getToolMessageContent = (message: ChatToolMessage): string => {
  return message.toolCalls
    ?.map((toolCall) => summarizeToolCall(toolCall.request, toolCall.response))
    .join('\n')
}

const ToolMessage = memo(function ToolMessage({
  message,
  conversationId,
  onMessageUpdate,
  onCommitUpdate,
}: {
  message: ChatToolMessage
  conversationId: string
  onMessageUpdate: (message: ChatToolMessage) => void
  onCommitUpdate: (
    messageId: string,
    callId: string,
    commit: CommitFact,
  ) => void
}) {
  const plugin = usePlugin()
  return (
    <div className="verbex-toolcall-container">
      {message.toolCalls.map((toolCall, index) => (
        <div
          key={toolCall.request.id}
          className={clsx(index > 0 && 'verbex-toolcall-border-top')}
        >
          <ToolCallItem
            request={toolCall.request}
            response={toolCall.response}
            conversationId={conversationId}
            onResponseUpdate={(response) =>
              onMessageUpdate({
                ...message,
                toolCalls: message.toolCalls.map((t) =>
                  t.request.id === toolCall.request.id ? { ...t, response } : t,
                ),
              })
            }
          />
          {toolCall.sessionEdit && (
            <DiagnosticSessionEditCard
              conversationId={conversationId}
              diagnostics={plugin.nativeProviderHost.diagnostics}
              fact={toolCall.sessionEdit}
              onReveal={(fact) =>
                plugin.nativeProviderHost.revealEdit(fact, conversationId)
              }
              onUndo={(fact) =>
                plugin.nativeProviderHost.undoEdit(fact, conversationId)
              }
            />
          )}
          {toolCall.commit && (
            <CommitCard
              key={`${conversationId}:${toolCall.commit.checkpointId}`}
              fact={toolCall.commit}
              anchorCapture={
                plugin.nativeProviderHost.options.outputAnchorCapture
              }
              onHandsCandidates={
                toolCall.commit.providerId === 'md-to-hwpx'
                  ? (fact, offset, signal) =>
                      resolveSavedAnchorCandidates(
                        plugin.nativeProviderHost.hostContext(),
                        plugin.nativeProviderHost.options.commitRuntime,
                        plugin.nativeProviderHost.options.outputAnchorCapture,
                        fact,
                        conversationId,
                        offset,
                        signal,
                      )
                  : undefined
              }
              onRevealCandidate={
                toolCall.commit.providerId === 'md-to-hwpx'
                  ? (fact, offset, blockIndex, signal) =>
                      revealSavedAnchorCandidate(
                        plugin.nativeProviderHost.hostContext(),
                        plugin.nativeProviderHost.options.commitRuntime,
                        plugin.nativeProviderHost.options.outputAnchorCapture,
                        fact,
                        conversationId,
                        offset,
                        blockIndex,
                        signal,
                      )
                  : undefined
              }
              conversationId={conversationId}
              onResolveAnchors={
                toolCall.commit.providerId === 'md-to-hwpx'
                  ? (fact, offset, signal) =>
                      resolveSavedAnchorRefs(
                        plugin.nativeProviderHost.hostContext(),
                        plugin.nativeProviderHost.options.commitRuntime,
                        plugin.nativeProviderHost.options.outputAnchorCapture,
                        fact,
                        conversationId,
                        offset,
                        signal,
                      )
                  : undefined
              }
              onAnchors={
                toolCall.commit.providerId === 'md-to-hwpx'
                  ? (fact) =>
                      savedOutputAnchorView(
                        plugin.nativeProviderHost.options.commitRuntime,
                        plugin.nativeProviderHost.options.outputAnchorCapture,
                        fact,
                        conversationId,
                      )
                  : undefined
              }
              onCheck={(fact) =>
                plugin.nativeProviderHost.checkCommit(fact, conversationId)
              }
              onUpdate={(commit) =>
                onCommitUpdate(message.id, toolCall.request.id, commit)
              }
            />
          )}
        </div>
      ))}
    </div>
  )
})

function ToolCallItem({
  request,
  response,
  conversationId,
  onResponseUpdate,
}: {
  request: ToolCallRequest
  response: ToolCallResponse
  conversationId: string
  onResponseUpdate: (response: ToolCallResponse) => void
}) {
  const { handleToolCall, handleReject, handleAbort } = useToolCall(
    request,
    conversationId,
    onResponseUpdate,
  )

  const [isOpen, setIsOpen] = useState(
    // Open by default if the tool call requires approval
    response.status === ToolCallResponseStatus.PendingApproval,
  )
  const [showRaw, setShowRaw] = useState(false)

  const parameters = useMemo(() => {
    if (!request.arguments) {
      return t('ui.ToolMessage.noParameters')
    }
    try {
      return JSON.stringify(JSON.parse(request.arguments), null, 2)
    } catch {
      return request.arguments
    }
  }, [request.arguments])

  return (
    <div className="verbex-toolcall">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="verbex-toolcall-header"
      >
        <div className="verbex-toolcall-header-icon">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="verbex-toolcall-header-content">
          <span className="verbex-toolcall-header-tool-name">
            {summarizeToolCall(request, response)}
          </span>
        </div>
        <div className="verbex-toolcall-header-icon verbex-toolcall-header-icon--status">
          <StatusIcon status={response.status} />
        </div>
      </div>
      {isOpen && (
        <div className="verbex-toolcall-content">
          {response.status === ToolCallResponseStatus.PendingApproval ? (
            <div className="verbex-toolcall-content-section">
              <div>{t('ui.ToolMessage.parameters')}</div>
              <ObsidianCodeBlock language="json" content={parameters} />
            </div>
          ) : (
            <>
              <button
                className="verbex-toolcall-raw-toggle"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowRaw(!showRaw)
                }}
                style={{
                  marginBottom: '8px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--background-secondary)',
                  fontSize: '0.85em',
                  color: 'var(--text-muted)',
                }}
              >
                {showRaw
                  ? t('ui.ToolMessage.compactView')
                  : t('ui.ToolMessage.advancedViewRawData')}
              </button>

              {showRaw && (
                <>
                  <div className="verbex-toolcall-content-section">
                    <div>{t('ui.ToolMessage.parameters')}</div>
                    <ObsidianCodeBlock language="json" content={parameters} />
                  </div>
                  {response.status === ToolCallResponseStatus.Success && (
                    <div className="verbex-toolcall-content-section">
                      <div>{t('ui.ToolMessage.result')}</div>
                      <ObsidianCodeBlock content={response.data.text} />
                    </div>
                  )}
                  {response.status === ToolCallResponseStatus.Error && (
                    <div className="verbex-toolcall-content-section">
                      <div>{t('ui.ToolMessage.error')}</div>
                      <ObsidianCodeBlock content={response.error} />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
      {response.binaryReceipt && (
        <div className="verbex-toolcall-content-section">
          <div>
            {
              {
                prepared: t('ui.ToolMessage.proposalBeforeSaving'),
                rejected: t('ui.ToolMessage.saveDenied'),
                applied: t('ui.ToolMessage.fileSaveVerified'),
                failed: t('ui.ToolMessage.saveFailed'),
                unknown: t(
                  'ui.ToolMessage.saveStatusUnknownDoNotRetryAutomatically',
                ),
              }[response.binaryReceipt.state]
            }
            : {response.binaryReceipt.path}
          </div>
          {response.binaryReceipt.checkpointId && (
            <div>
              {t('ui.ToolMessage.checkpoint')}
              {response.binaryReceipt.checkpointId}
            </div>
          )}
          {response.status === ToolCallResponseStatus.Aborted && (
            <div>
              {t('ui.ToolMessage.furtherExecutionStoppedCheckTheSaveAnd')}
            </div>
          )}
        </div>
      )}
      {(response.status === ToolCallResponseStatus.PendingApproval ||
        response.status === ToolCallResponseStatus.Running) && (
        <div className="verbex-toolcall-footer">
          {response.status === ToolCallResponseStatus.PendingApproval && (
            <div className="verbex-toolcall-footer-actions">
              <button
                onClick={() => {
                  void handleToolCall()
                  setIsOpen(false)
                }}
              >
                {t('ui.ToolMessage.allow')}
              </button>
              <button
                onClick={() => {
                  void handleReject()
                  setIsOpen(false)
                }}
              >
                {t('ui.ToolMessage.reject')}
              </button>
            </div>
          )}
          {response.status === ToolCallResponseStatus.Running && (
            <div className="verbex-toolcall-footer-actions">
              <button
                onClick={() => {
                  void handleAbort()
                }}
              >
                {t('ui.ToolMessage.abort')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function useToolCall(
  request: ToolCallRequest,
  conversationId: string,
  onResponseUpdate: (response: ToolCallResponse) => void,
) {
  const { getMcpManager } = useMcp()

  const handleToolCall = useCallback(async () => {
    const mcpManager = await getMcpManager()
    onResponseUpdate({
      status: ToolCallResponseStatus.Running,
    })
    let toolCallResponse: ToolCallResponse
    try {
      const authorization = await mcpManager.issueToolPermit({
        name: request.name,
        args: request.arguments,
        runId: conversationId,
        turnId: request.id,
      })
      toolCallResponse = await mcpManager.callTool({
        name: request.name,
        args: request.arguments,
        id: request.id,
        authorization,
      })
    } catch (error) {
      toolCallResponse = {
        status: ToolCallResponseStatus.Error,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    onResponseUpdate(toolCallResponse)
  }, [request, conversationId, onResponseUpdate, getMcpManager])

  const handleReject = useCallback(async () => {
    onResponseUpdate({
      status: ToolCallResponseStatus.Rejected,
    })
  }, [onResponseUpdate])

  const handleAbort = useCallback(async () => {
    const mcpManager = await getMcpManager()
    mcpManager.abortToolCall(request.id)
    onResponseUpdate({
      status: ToolCallResponseStatus.Aborted,
    })
  }, [request, onResponseUpdate, getMcpManager])

  return {
    handleToolCall,
    handleReject,
    handleAbort,
  }
}

function StatusIcon({ status }: { status: ToolCallResponseStatus }) {
  switch (status) {
    case ToolCallResponseStatus.PendingApproval:
      return null
    case ToolCallResponseStatus.Rejected:
    case ToolCallResponseStatus.Aborted:
    case ToolCallResponseStatus.Error:
      return <X size={16} style={{ color: 'var(--text-error)' }} />
    case ToolCallResponseStatus.Running:
      return <Loader2 size={16} className="spinner" />
    case ToolCallResponseStatus.Success:
      return <Check size={16} style={{ color: 'var(--text-success)' }} />
    default:
      return null
  }
}

export default ToolMessage
