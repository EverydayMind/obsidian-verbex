import { UseMutationResult, useMutation } from '@tanstack/react-query'
import { Notice } from 'obsidian'
import { useCallback, useRef } from 'react'

import { mutationFact } from '../../context/repeatedToolCalls'
import { useApp } from '../../contexts/app-context'
import { usePlugin } from '../../contexts/plugin-context'
import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
  LLMBaseUrlNotSetException,
} from '../../core/llm/exception'
import { selectedChatProvider } from '../../core/llm/readinessAction'
import { t } from '../../i18n'
import { pluginIsEnabled } from '../../provider/interop/discovery'
import { pluginDisplayName } from '../../provider/interop/pluginDisplayName'
import { excludedSkillNotice } from '../../skills/skillAvailability'
import { AuditEvent, ChatMessage } from '../../types/chat'
import { ToolCallResponseStatus } from '../../types/tool-call.types'
import { formatAgentErrorForUser } from '../../utils/chat/formatAgentErrorForUser'
import {
  finalizeLargeFileCard,
  updateLargeFileCard,
} from '../../utils/chat/largeFileCard'
import { markRunStateOnError } from '../../utils/chat/runStateOnError'
import { summarizeToolCall } from '../../utils/chat/toolCallSummary'
import { toolOutcomeResponse } from '../../utils/chat/toolOutcomeResponse'
import { inlineCode } from '../../utils/inlineCode'
import { uuidv4 } from '../../utils/uuid'
import { ConfirmModal } from '../modals/ConfirmModal'
import { ErrorModal } from '../modals/ErrorModal'
import { WikiTargetChoice, WikiTargetModal } from '../modals/IndexTargetModal'
import { openEditProviderModal } from '../settings/modals/providerModalOpeners'
import { providerSetupLabel } from '../settings/modals/providerSetupLabel'

import { insertAfterMessage } from './censusMessage'
import { changeLedger } from './changeLedger'
import { editorStateToPlainText } from './chat-input/utils/editor-state-to-plain-text'
import { buildChatSubmissionSnapshot } from './chatSubmissionSnapshot'
import { QueryProgressState } from './QueryProgress'
import { createFrameCoalescer } from './streamUpdateScheduler'

type UseChatStreamManagerParams = {
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  autoScrollToBottom: () => void
  setQueryProgress: React.Dispatch<React.SetStateAction<QueryProgressState>>
  onAuditEvent?: (event: AuditEvent) => void
}

function parseToolArgs(args?: string): Record<string, unknown> {
  if (!args) return {}
  try {
    const parsed: unknown = JSON.parse(args)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function insertBeforeMessage(
  messages: ChatMessage[],
  targetId: string,
  inserted: ChatMessage[],
): ChatMessage[] {
  const targetIndex = messages.findIndex((message) => message.id === targetId)
  if (targetIndex < 0) return [...messages, ...inserted]
  return [
    ...messages.slice(0, targetIndex),
    ...inserted,
    ...messages.slice(targetIndex),
  ]
}

export type UseChatStreamManager = {
  abortActiveStreams: () => void
  submitChatMutation: UseMutationResult<
    void,
    Error,
    {
      chatMessages: ChatMessage[]
      conversationId: string
      seedToolCalls?: import('../../types/tool-call.types').ToolCallRequest[]
      /** One-line facts about plugin Skills for this turn (display only). */
      skillFacts?: string[]
    }
  >
}

export function useChatStreamManager({
  setChatMessages,
  autoScrollToBottom,
  setQueryProgress,
  onAuditEvent,
}: UseChatStreamManagerParams): UseChatStreamManager {
  const app = useApp()
  const plugin = usePlugin()

  const activeStreamAbortControllersRef = useRef<AbortController[]>([])

  const abortActiveStreams = useCallback(() => {
    for (const abortController of activeStreamAbortControllersRef.current) {
      abortController.abort()
    }
    activeStreamAbortControllersRef.current = []
  }, [])

  const submitChatMutation = useMutation({
    mutationFn: async ({
      chatMessages,
      conversationId,
      seedToolCalls,
      skillFacts,
    }: {
      chatMessages: ChatMessage[]
      conversationId: string
      seedToolCalls?: import('../../types/tool-call.types').ToolCallRequest[]
      skillFacts?: string[]
    }) => {
      if (!(await plugin.ensureReady())) return
      const lastMessage = chatMessages.at(-1)
      if (!lastMessage) {
        // chatMessages is empty
        return
      }

      abortActiveStreams()
      const abortController = new AbortController()
      activeStreamAbortControllersRef.current.push(abortController)
      const largeFileCardIds = new Map<string, string>()
      const submitStartedAt = performance.now()
      let firstTextRecorded = false
      const finalizeActiveLargeFileCards = (
        outcome: 'completed' | 'failed' | 'cancelled',
      ) => {
        if (largeFileCardIds.size === 0) return
        const cardIds = new Set(largeFileCardIds.values())
        setChatMessages((prevChatMessages) =>
          prevChatMessages.map((message) =>
            message.role === 'assistant' &&
            message.verbexLargeFileCard &&
            !message.verbexLargeFileCard.done &&
            cardIds.has(message.id)
              ? {
                  ...message,
                  verbexLargeFileCard: finalizeLargeFileCard(
                    message.verbexLargeFileCard,
                    outcome,
                  ),
                }
              : message,
          ),
        )
      }

      const responseId = uuidv4()
      const streamUpdates = createFrameCoalescer<string>((text) => {
        setChatMessages((prevChatMessages) =>
          prevChatMessages.map((message) =>
            message.id === responseId && message.role === 'assistant'
              ? { ...message, content: text }
              : message,
          ),
        )
        autoScrollToBottom()
      })
      try {
        if (lastMessage.role !== 'user') return
        const request = lastMessage.content
          ? editorStateToPlainText(lastMessage.content).trim()
          : ''
        if (!request) return
        plugin.recordStartupDiagnostic('chat:submit-start', {
          historyMessageCount: chatMessages.length,
          requestChars: request.length,
        })

        setChatMessages((prevChatMessages) => [
          ...prevChatMessages,
          {
            role: 'assistant',
            id: responseId,
            content: '',
          },
        ])
        if (skillFacts?.length)
          setChatMessages((prev) =>
            insertBeforeMessage(
              prev,
              responseId,
              skillFacts.map((content) => ({
                role: 'assistant' as const,
                id: uuidv4(),
                content,
                verbexToolSummary: true,
              })),
            ),
          )

        const snapshot = buildChatSubmissionSnapshot({
          conversationId,
          chatMessages,
          lastMessage,
          request,
          currentFile: app.workspace.getActiveFile(),
          maxIterations: plugin.settings.chatOptions.maxAutoIterations,
          isPluginEnabled: (id) => pluginIsEnabled(app, id),
        })
        for (const skill of snapshot.excludedSkillDetails) {
          new Notice(
            excludedSkillNotice(
              skill.name,
              skill.missingPlugins.map((id) => pluginDisplayName(app, id)),
            ),
          )
        }
        plugin.refreshProviderSecrets()
        const result = await plugin.verbexController.runAgent({
          ...snapshot,
          seedToolCalls,
          signal: abortController.signal,
          // §6.6: only genuinely expensive whole-document jobs reach here (the
          // controller gates on the estimated chunk count); ordinary large files
          // stay friction-free and never open this modal.
          onConfirmLargeOperation: (info) =>
            new Promise<boolean>((resolve) => {
              const label =
                info.operation === 'transform'
                  ? t('ui.useChatStreamManager.wholeDocumentConversion')
                  : t('ui.useChatStreamManager.wholeDocumentAnalysis')
              // The confirm button fires onConfirm right after closing the modal,
              // so record the choice and read it on the next microtask; a dismiss
              // (ESC / click-outside) leaves it null and counts as a cancel.
              let choice: boolean | null = null
              const modal = new ConfirmModal(app, {
                title: t(
                  'ui.useChatStreamManager.confirmLargeDocumentOperation',
                ),
                message:
                  t(
                    'ui.useChatStreamManager.processingForWillHandleAboutSections',
                    { p0: info.path, p1: label, p2: info.estimatedChunks },
                  ) +
                  t(
                    'ui.useChatStreamManager.sequentiallyRequiringLLMCallsTimeAndCost',
                  ),
                ctaText: t('ui.useChatStreamManager.continue'),
                onConfirm: () => {
                  choice = true
                },
                onCancel: () => {
                  choice = false
                },
              })
              const closeModal = modal.onClose.bind(modal) as () => void
              modal.onClose = () => {
                closeModal()
                queueMicrotask(() => resolve(choice ?? false))
              }
              modal.open()
            }),
          // wiki 생성/재사용 전 확인: 대상 폴더를 사용자에게 확정받고, 그
          // 폴더에 기존 wiki가 있으면 재사용/재빌드를 고르게 한다. 닫기만
          // 하면(ESC 등) 취소로 처리된다.
          onConfirmWikiTarget: (info) =>
            new Promise<WikiTargetChoice | null>((resolve) => {
              let choice: WikiTargetChoice | null = null
              const modal = new WikiTargetModal(app, {
                proposedFolder: info.proposedFolder,
                sourceLabel: info.sourceLabel,
                probeFolder: info.probeFolder,
                title: info.labels?.title,
                prompt: info.labels?.prompt,
                placeholder: info.labels?.placeholder,
                reuseLabel: info.labels?.reuseLabel,
                buildLabel: info.labels?.buildLabel,
                onSubmit: (selected) => {
                  choice = selected
                },
                onCancel: () => {
                  choice = null
                },
              })
              const closeModal = modal.onClose.bind(modal) as () => void
              modal.onClose = () => {
                closeModal()
                queueMicrotask(() => resolve(choice))
              }
              modal.open()
            }),
          onConfirmValidationOverride: (info) =>
            new Promise<boolean>((resolve) => {
              let choice = false
              const modal = new ConfirmModal(app, {
                title: t(
                  'ui.useChatStreamManager.applyTheItemsThatFailedValidationAs',
                ),
                message:
                  t(
                    'ui.useChatStreamManager.automaticValidationRepeatedlyFailedNNN',
                    { p0: info.failureMessage },
                  ) +
                  t(
                    'ui.useChatStreamManager.acceptTheCurrentResultWithoutFurtherAttempts',
                  ),
                ctaText: t('ui.useChatStreamManager.applyAsIsY'),
                onConfirm: () => {
                  choice = true
                },
                onCancel: () => {
                  choice = false
                },
              })
              const closeModal = modal.onClose.bind(modal) as () => void
              modal.onClose = () => {
                closeModal()
                queueMicrotask(() => resolve(choice))
              }
              modal.open()
            }),
          onAuditEvent: (event) =>
            onAuditEvent?.({
              ...event,
              // The user message id is the stable turn boundary. It is not
              // content and lets the chat panel aggregate a whole run.
              turnId: lastMessage.id,
            }),
          onToolResult: (call, result, executionOutcome) => {
            streamUpdates.flush()
            if (!call.name.startsWith('context_')) {
              onAuditEvent?.({
                turnId: lastMessage.id,
                timestamp: Date.now(),
                actor: 'system',
                kind: 'tool_call',
                summary: 'Tool call completed',
                details: { tool: call.name },
              })
            }
            // §6.3: fold the whole-document map-reduce completion into its status
            // card instead of adding a raw tool message. Fall through only if no
            // card was created (so nothing is silently swallowed).
            if (call.name === 'large_file_mapreduce') {
              const args = parseToolArgs(call.arguments)
              const path = typeof args.path === 'string' ? args.path : null
              const cardId = path ? largeFileCardIds.get(path) : undefined
              if (cardId) {
                setChatMessages((prevChatMessages) =>
                  prevChatMessages.map((message) =>
                    message.id === cardId &&
                    message.role === 'assistant' &&
                    message.verbexLargeFileCard
                      ? {
                          ...message,
                          verbexLargeFileCard: finalizeLargeFileCard(
                            message.verbexLargeFileCard,
                          ),
                        }
                      : message,
                  ),
                )
                autoScrollToBottom()
                return
              }
            }
            if (call.name === 'transform_large_file') {
              const args = parseToolArgs(call.arguments)
              const path = typeof args.path === 'string' ? args.path : null
              const cardId = path ? largeFileCardIds.get(path) : undefined
              if (cardId) {
                const status = toolOutcomeResponse(
                  result,
                  executionOutcome,
                ).status
                const outcome =
                  status === ToolCallResponseStatus.Success
                    ? 'completed'
                    : status === ToolCallResponseStatus.Rejected ||
                        status === ToolCallResponseStatus.Aborted
                      ? 'cancelled'
                      : 'failed'
                setChatMessages((prevChatMessages) =>
                  prevChatMessages.map((message) =>
                    message.id === cardId &&
                    message.role === 'assistant' &&
                    message.verbexLargeFileCard
                      ? {
                          ...message,
                          verbexLargeFileCard: finalizeLargeFileCard(
                            message.verbexLargeFileCard,
                            outcome,
                          ),
                        }
                      : message,
                  ),
                )
              }
            }
            const toolResponseObj = toolOutcomeResponse(
              result,
              executionOutcome,
            )
            setChatMessages((prevChatMessages) =>
              insertBeforeMessage(prevChatMessages, responseId, [
                {
                  role: 'assistant',
                  id: uuidv4(),
                  content: summarizeToolCall(call, toolResponseObj, {
                    markdown: true,
                  }),
                  verbexToolSummary: true,
                },
                {
                  role: 'tool',
                  id: uuidv4(),
                  toolCalls: [
                    {
                      request: call,
                      response: toolResponseObj,
                      ...(executionOutcome?.sessionEdit
                        ? { sessionEdit: executionOutcome.sessionEdit }
                        : {}),
                      ...(executionOutcome?.commit
                        ? { commit: executionOutcome.commit }
                        : {}),
                    },
                  ],
                },
              ]),
            )
            autoScrollToBottom()
          },
          onCensusReportStatus: (active) => {
            if (!abortController.signal.aborted) {
              streamUpdates.flush()
              setQueryProgress({ type: active ? 'census-report' : 'idle' })
            }
          },
          onStatusChange: (status) => {
            if (status.type === 'llm_request') {
              setQueryProgress({
                type: 'agent-thinking',
                iteration: status.iteration,
              })
            } else if (status.type === 'tool_start') {
              streamUpdates.flush()
              setQueryProgress({
                type: 'agent-tool-start',
                toolName: status.toolName,
                args: status.args,
                iteration: status.iteration,
              })
            } else if (status.type === 'large_file_progress') {
              setQueryProgress({
                type: 'large-file-progress',
                operation: status.operation,
                phase: status.phase,
                path: status.path,
                index: status.index,
                total: status.total,
              })
              // §6.3: upsert the single persistent status card for this file.
              const existingId = largeFileCardIds.get(status.path)
              const cardId = existingId ?? uuidv4()
              if (!existingId) largeFileCardIds.set(status.path, cardId)
              setChatMessages((prevChatMessages) => {
                const existing = prevChatMessages.find(
                  (message) => message.id === cardId,
                )
                if (
                  existing &&
                  existing.role === 'assistant' &&
                  !existing.verbexLargeFileCard?.done
                ) {
                  const card = updateLargeFileCard(
                    existing.verbexLargeFileCard ?? null,
                    status,
                  )
                  return prevChatMessages.map((message) =>
                    message.id === cardId
                      ? { ...message, verbexLargeFileCard: card }
                      : message,
                  )
                }
                if (existing) return prevChatMessages
                return insertBeforeMessage(prevChatMessages, responseId, [
                  {
                    role: 'assistant',
                    id: cardId,
                    content: '',
                    verbexLargeFileCard: updateLargeFileCard(null, status),
                  },
                ])
              })
              autoScrollToBottom()
            }
          },
          onChatUsage: (usage) => {
            setChatMessages((previous) =>
              previous.map((message) =>
                message.id === responseId && message.role === 'assistant'
                  ? {
                      ...message,
                      verbexCallUsage: [
                        ...(message.verbexCallUsage ?? []),
                        usage,
                      ],
                    }
                  : message,
              ),
            )
          },
          onTextUpdate: (text) => {
            if (!firstTextRecorded) {
              firstTextRecorded = true
              plugin.recordStartupDiagnostic('chat:first-text', {
                durationMs:
                  Math.round((performance.now() - submitStartedAt) * 100) / 100,
              })
            }
            streamUpdates.schedule(text)
          },
        })

        // A successful analysis/transform finalizes in onToolResult. Anything
        // still active here ended without a success result and must not be shown
        // as completed merely because the outer agent loop returned.
        finalizeActiveLargeFileCards('failed')
        streamUpdates.flush()

        if (result.censusReport) {
          const report = result.censusReport
          setChatMessages((previous) =>
            insertAfterMessage(
              previous,
              responseId,
              [
                {
                  role: 'assistant',
                  id: uuidv4(),
                  content: '',
                  verbexToolSummary: true,
                  verbexCensusReport: {
                    ...report,
                    responseMessageId: responseId,
                  },
                },
              ],
              abortController.signal,
            ),
          )
        }

        setChatMessages((previous) => {
          const responseIndex = previous.findIndex(
            (message) => message.id === responseId,
          )
          const priorApplied = previous
            .slice(0, responseIndex < 0 ? previous.length : responseIndex)
            .some(
              (message) =>
                message.role === 'assistant' &&
                (message.verbexChangeLedger?.applied ?? 0) > 0,
            )
          const ledger = changeLedger(result.mutations, priorApplied)
          return ledger
            ? insertBeforeMessage(previous, responseId, [
                {
                  role: 'assistant',
                  id: uuidv4(),
                  verbexToolSummary: true,
                  verbexChangeLedger: { applied: ledger.applied },
                  content: ledger.content,
                },
              ])
            : previous
        })

        if (
          result.evidence.inspectedPaths.length > 0 ||
          result.documentReadSummary?.length
        ) {
          const discovered = result.evidence.discoveredPaths.length
          const inspected = result.evidence.inspectedPaths
          setChatMessages((prevChatMessages) =>
            insertBeforeMessage(prevChatMessages, responseId, [
              {
                role: 'assistant',
                id: uuidv4(),
                verbexToolSummary: true,
                content: [
                  t(
                    'ui.useChatStreamManager.evidenceLedgerSearchCandidatesSourceDocumentsReturned',
                    { p0: discovered, p1: inspected.length },
                  ),
                  ...inspected.map((path) => `- ${inlineCode(path)}`),
                  ...(result.documentReadSummary ?? []),
                ].join('\n'),
              },
            ]),
          )
        }

        setChatMessages((prevChatMessages) =>
          prevChatMessages.map((message) =>
            message.id === responseId && message.role === 'assistant'
              ? {
                  ...message,
                  content: result.finalText,
                  metadata: result.usage
                    ? {
                        usage: {
                          prompt_tokens: result.usage.prompt_tokens,
                          completion_tokens: result.usage.completion_tokens,
                          total_tokens: result.usage.total_tokens,
                        },
                      }
                    : undefined,
                }
              : message,
          ),
        )
        autoScrollToBottom()
        plugin.recordStartupDiagnostic('chat:submit-complete', {
          durationMs:
            Math.round((performance.now() - submitStartedAt) * 100) / 100,
          stoppedReason: result.stoppedReason,
          messageCount: chatMessages.length,
        })

        if (result.stoppedReason === 'max_iterations') {
          if (result.failureReason === 'mutation_failure_unreported') {
            new Notice(result.finalText, 10000)
            return
          }
          const detail =
            result.failureReason === 'invalid_no_tool_response'
              ? t(
                  'ui.useChatStreamManager.theModelRepeatedlyReturnedPlainTextInstead',
                )
              : t('ui.useChatStreamManager.theLastToolResultMayNotHave')
          new Notice(
            t(
              'ui.useChatStreamManager.theAutomaticIterationLimitWasReachedBefore',
              { p0: result.iterations },
            ) +
              detail +
              (result.repeatedTool
                ? t('ui.useChatStreamManager.toolWasCalledTimesWithTheSame', {
                    p0: result.repeatedTool.name,
                    p1: result.repeatedTool.count,
                    p2: mutationFact(result.repeatedTool),
                  })
                : t(
                    'ui.useChatStreamManager.increaseMaxAutoToolRequestsInSettings',
                  )),
            10000,
          )
        } else if (result.failureReason === 'verification_failed') {
          new Notice(result.finalText, 10000)
        } else if (result.validationOverridden) {
          new Notice(
            t('ui.useChatStreamManager.appliedAsIsAfterTheUserAccepted'),
            8000,
          )
        }
      } catch (error) {
        streamUpdates.flush()
        // Ignore AbortError
        if (error instanceof Error && error.name === 'AbortError') {
          finalizeActiveLargeFileCards('cancelled')
          setChatMessages((previous) =>
            markRunStateOnError(previous, responseId, error),
          )
          return
        }
        finalizeActiveLargeFileCards('failed')
        setChatMessages((previous) =>
          markRunStateOnError(previous, responseId, error),
        )
        throw error
      } finally {
        streamUpdates.cancel()
        setQueryProgress({ type: 'idle' })
        activeStreamAbortControllersRef.current =
          activeStreamAbortControllersRef.current.filter(
            (controller) => controller !== abortController,
          )
      }
    },
    onError: (error) => {
      if (
        error instanceof LLMAPIKeyNotSetException ||
        error instanceof LLMAPIKeyInvalidException ||
        error instanceof LLMBaseUrlNotSetException
      ) {
        const provider = selectedChatProvider(plugin.settings)
        new ErrorModal(app, 'Error', error.message, error.rawError?.message, {
          showSettingsButton: true,
          action: provider && {
            label: providerSetupLabel(provider),
            onClick: () => openEditProviderModal(app, plugin, provider),
          },
        }).open()
      } else {
        new Notice(formatAgentErrorForUser(error))
        console.error('Failed to generate response', error)
      }
    },
  })

  return {
    abortActiveStreams,
    submitChatMutation,
  }
}
