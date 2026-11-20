import { useMutation } from '@tanstack/react-query'
import {
  Book,
  ChevronRight,
  CircleStop,
  History,
  Plus,
  Wand2,
} from 'lucide-react'
import { Notice, TFile } from 'obsidian'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useApp } from '../../contexts/app-context'
import { useMcp } from '../../contexts/mcp-context'
import { usePlugin } from '../../contexts/plugin-context'
import { useRAG } from '../../contexts/rag-context'
import { useSettings } from '../../contexts/settings-context'
import { getChatModelClient } from '../../core/llm/manager'
import {
  checkRunModelReadiness,
  formatChatModelReadinessMessage,
  isExecutionReady,
} from '../../core/llm/modelReadiness'
import { resolveChatModelId } from '../../core/llm/modelSelection'
import { useChatHistory } from '../../hooks/useChatHistory'
import { t } from '../../i18n'
import type {
  ChatSubmissionResult,
  VerbexChatSubmissionOptions,
} from '../../provider/contract'
import { isWebHandsEnabled } from '../../provider/interop/webHands'
import { withAuthorizedProviderRequest } from '../../security/promptInjectionBoundary'
import * as standaloneSkills from '../../skills/standaloneSkills'
import {
  AssistantToolMessageGroup,
  AuditEvent,
  AuditTurnRecord,
  ChatMessage,
  ChatSkillContextItem,
  ChatUserMessage,
  ChatWorkflowContextItem,
  SkillWorkflowSelectionMode,
} from '../../types/chat'
import { MentionableBlock, MentionableBlockData } from '../../types/mentionable'
import type { ToolCallRequest } from '../../types/tool-call.types'
import {
  getMentionableKey,
  serializeMentionable,
} from '../../utils/chat/mentionable'
import { groupAssistantAndToolMessages } from '../../utils/chat/message-groups'
import { saveDocumentRequest } from '../../utils/chat/modelUserRequests'
import {
  MAX_SELECTED_WORKFLOW_GUIDES,
  PromptGenerator,
} from '../../utils/chat/promptGenerator'
import { createSkillDiagnosticNotifier } from '../../utils/chat/skillDiagnosticNotice'
import { submittedMessages } from '../../utils/chat/submittedMessages'
import { computeSelectionSizeFact } from '../../utils/obsidian'
import { uuidv4 } from '../../utils/uuid'
import { confirmDiscardAgentChanges } from '../modals/DiscardAgentChangesModal'
import { TemplateSectionModal } from '../modals/TemplateSectionModal'

import { applyResultText } from './applyResultText'
import { ApplyStrategy } from './ApplyTargetModal'
import AssistantToolMessageGroupItem from './AssistantToolMessageGroupItem'
import { AuditTracePanel } from './AuditTracePanel'
import ChatUserInput, { ChatUserInputRef } from './chat-input/ChatUserInput'
import { editorStateToPlainText } from './chat-input/utils/editor-state-to-plain-text'
import { plainTextToEditorState } from './chat-input/utils/plain-text-to-editor-state'
import { ChatContextSelector } from './ChatContextSelector'
import { ChatListDropdown } from './ChatListDropdown'
import { ChatModelReadinessBanner } from './ChatModelReadinessBanner'
import { buildConfirmedSelectionMessage } from './companionSubmission'
import OffscreenUnsavedCard, { OffscreenDoc } from './OffscreenUnsavedCard'
import { PluginApprovalBanner } from './PluginApprovalBanner'
import QueryProgress, { QueryProgressState } from './QueryProgress'
import { RecordCleanupButton } from './RecordCleanupButton'
import { workflowAuditText } from './selectionEvidence'
import { SelectionEvidencePicker } from './SelectionEvidencePicker'
import { markRecommendedContexts, recordSelectionUsage } from './selectionUsage'
import { SessionExportButton } from './SessionExportButton'
import SessionGrants from './SessionGrants'
import {
  selectedNamesFromContext,
  selectedWorkflowIdsFromContext,
  selectionWasChanged,
  shouldConfirmSelection,
} from './shouldConfirmSelection'
import { SelectedSkillBadge } from './SkillAvailability'
import { StarterAssetsBanner } from './StarterAssetsBanner'
import { useApplyTarget } from './useApplyTarget'
import { useAutoScroll } from './useAutoScroll'
import { useBrowserContext } from './useBrowserContext'
import { useChatHistoryPersistence } from './useChatHistoryPersistence'
import { useChatInputState } from './useChatInputState'
import { useChatStreamManager } from './useChatStreamManager'
import { useDraftActiveFile } from './useDraftActiveFile'
import { useOffscreenDocuments } from './useOffscreenDocuments'
import { useProposalSubmission } from './useProposalSubmission'
import UserMessageItem from './UserMessageItem'
import { useToolMessageResume } from './useToolMessageResume'

export type ChatRef = {
  openNewChat: (selectedBlock?: MentionableBlockData) => void
  addSelectionToChat: (selectedBlock: MentionableBlockData) => void
  focusMessage: () => void
  sendMessage: (message: string) => Promise<boolean>
  sendMessageV2: (
    message: string,
    options?: VerbexChatSubmissionOptions,
  ) => Promise<ChatSubmissionResult>
}

export type ChatProps = {
  selectedBlock?: MentionableBlockData
}

type PendingSelection = {
  rawInputMessage: ChatUserMessage
  keywordSkills: string[]
  llmSkills: string[]
  skillBoundWorkflowId: string | null
  llmWorkflowId: string | null
  recommendedSkillNames: string[]
  recommendedWorkflowIds: string[]
  workflowEvidence: Record<string, standaloneSkills.WorkflowEvidence>
  suggestedWorkflowIds: string[]
  suggestedSkillNames: string[]
  skillContext: ChatSkillContextItem[]
  workflowContext: ChatWorkflowContextItem[]
}

const seenSkillDiagnosticKeys = new Set<string>()

function lastUserSelectionFromMessages(messages: ChatMessage[]): {
  selectedSkillNames: string[]
  selectedWorkflowIds: string[]
} | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user') continue
    if (!message.skillContext && !message.workflowContext) continue
    return {
      selectedSkillNames: selectedNamesFromContext(message.skillContext),
      selectedWorkflowIds: selectedWorkflowIdsFromContext(
        message.workflowContext,
      ),
    }
  }
  return null
}

const Chat = forwardRef<ChatRef, ChatProps>((props, ref) => {
  const app = useApp()
  const plugin = usePlugin()
  const { settings, setSettings } = useSettings()
  const { getRAGEngine, getRAGEngineIfReady } = useRAG()
  const { getMcpManager } = useMcp()

  const {
    createOrUpdateConversation,
    saveConversationNow,
    flushPendingConversationSave,
    deleteConversation,
    getChatById,
    updateConversationTitle,
    chatList,
    refreshChatList,
    initializationError,
    unreadableChatCount,
  } = useChatHistory()
  const promptGenerator = useMemo(() => {
    return new PromptGenerator(
      getRAGEngine,
      app,
      settings,
      getRAGEngineIfReady,
      plugin.verbexController.lexicalIndex,
      plugin.verbexController.catalogService,
    )
  }, [getRAGEngine, getRAGEngineIfReady, app, plugin, settings])

  const {
    inputMessage,
    setInputMessage,
    addedBlockKey,
    resetInputMessage,
    setAddedBlock,
  } = useChatInputState(app, props.selectedBlock)
  const [pinnedConnectorTools, setPinnedConnectorTools] = useState<string[]>([])
  const [excludedToolNames, setExcludedToolNames] = useState<string[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const proposalSeeds = useRef(new Map<string, ToolCallRequest[]>())
  const [auditLog, setAuditLog] = useState<AuditTurnRecord[]>([])
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
  const [currentConversationId, setCurrentConversationId] =
    useState<string>(uuidv4())
  const { capture: captureBrowser, control: browserControl } =
    useBrowserContext(plugin.nativeProviderHost, app, currentConversationId)
  const [queryProgress, setQueryProgress] = useState<QueryProgressState>({
    type: 'idle',
  })
  // null = not yet selected, [] = no skills apply, [...] = selected skill names
  const [selectedSkills, setSelectedSkills] = useState<string[] | null>(null)
  const manuallySelectedSkills = useRef(new Set<string>())
  const [isSelectingSkills, setIsSelectingSkills] = useState(false)
  const [, refreshSkillAvailability] = useState(0)
  const [isPreparingSelection, setIsPreparingSelection] = useState(false)
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null)
  const [skillWorkflowSelectionMode, setSkillWorkflowSelectionMode] =
    useState<SkillWorkflowSelectionMode>('auto')
  // null = not selected yet; [] = no workflow; [id] = the one active workflow.
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<
    string[] | null
  >(null)
  const [selectedWorkflowLabels, setSelectedWorkflowLabels] = useState<
    string[]
  >([])
  // Full skill / workflow catalog with `included` flags, driving the in-chat
  // picker so the active selection can be changed mid-conversation (요구 4-2).
  const [availableSkills, setAvailableSkills] = useState<
    ChatSkillContextItem[]
  >([])
  const [availableWorkflows, setAvailableWorkflows] = useState<
    ChatWorkflowContextItem[]
  >([])

  const groupedChatMessages: (ChatUserMessage | AssistantToolMessageGroup)[] =
    useMemo(() => {
      return groupAssistantAndToolMessages(chatMessages)
    }, [chatMessages])

  const chatUserInputRefs = useRef<Map<string, ChatUserInputRef>>(new Map())
  const chatMessagesRef = useRef<HTMLDivElement>(null)

  const appendAuditEvent = useCallback(
    (event: AuditEvent) => {
      if (!settings.verbex.privacy.auditLogging) return
      const turnId = event.turnId ?? `legacy-${event.timestamp}`
      const isAggregateEvent =
        event.kind === 'tool_call' || event.kind.startsWith('context_')
      const aggregateKey = isAggregateEvent
        ? [
            event.kind,
            event.details?.tool ?? '',
            event.details?.status ?? '',
            event.details?.mutation ?? '',
          ].join(':')
        : null
      setAuditLog((previous) => {
        const aggregate = (events: AuditEvent[]): AuditEvent[] => {
          if (!aggregateKey) return [...events, event]
          const existingIndex = events.findIndex((candidate) => {
            if (candidate.kind !== event.kind) return false
            return (
              [
                candidate.kind,
                candidate.details?.tool ?? '',
                candidate.details?.status ?? '',
                candidate.details?.mutation ?? '',
              ].join(':') === aggregateKey
            )
          })
          if (existingIndex < 0) {
            return [
              ...events,
              { ...event, details: { ...event.details, count: 1 } },
            ]
          }
          const nextEvents = [...events]
          const existing = nextEvents[existingIndex]
          const nextDetails = { ...existing.details }
          for (const [key, value] of Object.entries(event.details ?? {})) {
            if (key === 'tool' || key === 'status' || key === 'mutation') {
              continue
            }
            if (typeof value === 'number') {
              const previousValue = nextDetails[key]
              nextDetails[key] =
                typeof previousValue === 'number'
                  ? previousValue + value
                  : value
            } else {
              nextDetails[key] = value
            }
          }
          nextDetails.count = (Number(nextDetails.count) || 1) + 1
          nextEvents[existingIndex] = { ...existing, details: nextDetails }
          return nextEvents
        }
        const index = previous.findIndex((turn) => turn.turnId === turnId)
        if (index < 0) {
          return [
            ...previous,
            {
              turnId,
              startedAt: event.timestamp,
              completedAt: event.timestamp,
              events: aggregate([]),
            },
          ]
        }
        const next = [...previous]
        const current = next[index]
        next[index] = {
          ...current,
          completedAt: event.timestamp,
          events: aggregate(current.events),
        }
        return next
      })
    },
    [settings.verbex.privacy.auditLogging],
  )

  const { autoScrollToBottom, forceScrollToBottom } = useAutoScroll({
    scrollContainerRef: chatMessagesRef,
  })

  const { abortActiveStreams, submitChatMutation } = useChatStreamManager({
    setChatMessages,
    autoScrollToBottom,
    setQueryProgress,
    onAuditEvent: appendAuditEvent,
  })

  useChatHistoryPersistence({
    chatMessages,
    conversationId: currentConversationId,
    createOrUpdateConversation,
    saveConversationNow,
    flushPendingConversationSave,
    auditLog,
    skillWorkflowSelectionMode,
    selectedSkillNames: selectedSkills,
    selectedWorkflowIds,
    isStreaming: submitChatMutation.isPending,
  })

  const {
    handleContinueResponse,
    handleToolMessageUpdate,
    handleCommitUpdate,
    showContinueResponseButton,
  } = useToolMessageResume({
    chatMessages,
    conversationId: currentConversationId,
    forceScrollToBottom,
    getMcpManager,
    setChatMessages,
    submitChatMutation,
  })

  const registerChatUserInputRef = (
    id: string,
    ref: ChatUserInputRef | null,
  ) => {
    if (ref) {
      chatUserInputRefs.current.set(id, ref)
    } else {
      chatUserInputRefs.current.delete(id)
    }
  }

  const handleLoadConversation = async (conversationId: string) => {
    try {
      abortActiveStreams()
      const conversation = await getChatById(conversationId)
      if (!conversation) {
        throw new Error('Conversation not found')
      }
      setCurrentConversationId(conversationId)
      setPinnedConnectorTools(
        [...conversation.messages]
          .reverse()
          .find((message) => message.role === 'user')?.pinnedConnectorTools ??
          [],
      )
      setExcludedToolNames(
        [...conversation.messages]
          .reverse()
          .find((message) => message.role === 'user')?.excludedToolNames ?? [],
      )
      manuallySelectedSkills.current = standaloneSkills.restoreManualSkillNames(
        conversation.messages,
      )
      setChatMessages(conversation.messages)
      setAuditLog(conversation.auditLog)
      const newInputMessage = resetInputMessage()
      setInputMessage(newInputMessage)
      setFocusedMessageId(newInputMessage.id)
      setQueryProgress({ type: 'idle' })
      setPendingSelection(null)
      setIsPreparingSelection(false)
      const restoredSelection =
        conversation.selectedSkillNames || conversation.selectedWorkflowIds
          ? {
              selectedSkillNames: conversation.selectedSkillNames ?? [],
              selectedWorkflowIds: conversation.selectedWorkflowIds ?? [],
            }
          : lastUserSelectionFromMessages(conversation.messages)
      const restoredMode =
        conversation.skillWorkflowSelectionMode ??
        (restoredSelection ? 'locked' : 'auto')
      setSkillWorkflowSelectionMode(restoredMode)
      setSelectedSkills(restoredSelection?.selectedSkillNames ?? null)
      promptGenerator.setSelectedSkillNames(
        restoredSelection?.selectedSkillNames ?? null,
      )
      setSelectedWorkflowIds(restoredSelection?.selectedWorkflowIds ?? null)
      setSelectedWorkflowLabels([])
      promptGenerator.setSelectedWorkflowIds(
        restoredSelection?.selectedWorkflowIds ?? null,
      )
    } catch (error) {
      new Notice(t('notices.chat.loadFailed'))
      console.error('Failed to load conversation', error)
    }
  }

  const handleNewChat = (selectedBlock?: MentionableBlockData) => {
    manuallySelectedSkills.current.clear()
    setPinnedConnectorTools([])
    setExcludedToolNames([])
    setCurrentConversationId(uuidv4())
    setChatMessages([])
    setAuditLog([])
    const newInputMessage = resetInputMessage(selectedBlock)
    setInputMessage(newInputMessage)
    setFocusedMessageId(newInputMessage.id)
    setQueryProgress({ type: 'idle' })
    setPendingSelection(null)
    setIsPreparingSelection(false)
    setSkillWorkflowSelectionMode('auto')
    setSelectedSkills(null)
    promptGenerator.setSelectedSkillNames(null)
    setSelectedWorkflowIds(null)
    setSelectedWorkflowLabels([])
    promptGenerator.setSelectedWorkflowIds(null)
    abortActiveStreams()
  }

  const prepareConfirmedSelection = useCallback(
    (selection: PendingSelection) => {
      const selectedSkillNames = selectedNamesFromContext(
        selection.skillContext,
      )
      const selectedWorkflowIds = selectedWorkflowIdsFromContext(
        selection.workflowContext,
      )
      const manuallyChanged = selectionWasChanged(
        selectedSkillNames,
        selectedWorkflowIds,
        selection.recommendedSkillNames,
        selection.recommendedWorkflowIds,
      )
      if (manuallyChanged) setSkillWorkflowSelectionMode('locked')
      manuallySelectedSkills.current = standaloneSkills.selectedManualNames(
        selection.skillContext,
      )
      setSelectedSkills(selectedSkillNames)
      promptGenerator.setSelectedSkillNames(selectedSkillNames)
      setSelectedWorkflowIds(selectedWorkflowIds)
      setSelectedWorkflowLabels(
        selection.workflowContext
          .filter((workflow) => workflow.included)
          .map((workflow) => workflow.name || workflow.id),
      )
      promptGenerator.setSelectedWorkflowIds(selectedWorkflowIds)
      setPendingSelection(null)
      return buildConfirmedSelectionMessage(
        selection.rawInputMessage,
        selection.skillContext,
        selection.workflowContext,
      )
    },
    [promptGenerator],
  )

  const handleUserMessageSubmit = useCallback(
    async ({
      inputChatMessages,
      resetSubmittedInput = false,
      confirmedSelection = false,
    }: {
      inputChatMessages: ChatMessage[]
      resetSubmittedInput?: boolean
      confirmedSelection?: boolean
    }): Promise<ChatSubmissionResult> => {
      const submitted = inputChatMessages.at(-1)
      if (submitted?.role === 'user') {
        if (!isWebHandsEnabled(app)) delete submitted.browserContext
        else if (!confirmedSelection)
          submitted.browserContext = await captureBrowser()
      }
      if (!(await plugin.ensureReady())) {
        return { status: 'not_ready', reason: 'Verbex plugin is not ready.' }
      }
      plugin.verbexController.catalogService.invalidate()

      // Pre-flight (§3.4-3): block before any provider call — including the
      // keyword/LLM skill-workflow selector below, which uses the 'fast'
      // alias — when the model this submission would actually use (main or
      // fast) is not ready. Covers submit, resubmit, and NEXT alike since
      // they all funnel through this one handler.
      plugin.refreshProviderSecrets()
      const settings = plugin.settings
      const mainReadiness = checkRunModelReadiness(settings, {
        requireTools: settings.chatOptions.enableTools,
      })
      if (!isExecutionReady(mainReadiness)) {
        new Notice(formatChatModelReadinessMessage(mainReadiness))
        return {
          status: 'not_ready',
          reason: formatChatModelReadinessMessage(mainReadiness),
        }
      }
      const fastReadiness = checkRunModelReadiness(settings, {
        alias: 'fast',
      })
      if (!isExecutionReady(fastReadiness)) {
        new Notice(formatChatModelReadinessMessage(fastReadiness))
        return {
          status: 'not_ready',
          reason: formatChatModelReadinessMessage(fastReadiness),
        }
      }

      abortActiveStreams()
      setQueryProgress({
        type: 'idle',
      })

      const lastMessage = inputChatMessages.at(-1)
      if (lastMessage?.role !== 'user') {
        throw new Error('Last message is not a user message')
      }
      lastMessage.pinnedConnectorTools = [...pinnedConnectorTools]
      lastMessage.excludedToolNames = [...excludedToolNames]

      // Snapshot the *effective* (readiness-resolved) model in effect at
      // submission time, not raw settings.chatModelId (§3.4): ChatUserMessage
      // has no other record of which model a given turn used, and settings
      // can change afterwards - without this, past queries would misreport
      // whatever model happens to be selected now, or show an alias id that
      // was never actually resolvable.
      lastMessage.modelId = mainReadiness.modelId

      const userQuery = lastMessage.content
        ? editorStateToPlainText(lastMessage.content).trim()
        : ''

      let effectiveSelectedSkills: string[] =
        lastMessage.skillContext
          ?.filter((skill) => skill.included)
          .map((skill) => skill.name) ??
        selectedSkills ??
        []
      let skillContext = lastMessage.skillContext
      let effectiveSelectedWorkflowIds = selectedWorkflowIds ?? []
      let workflowContext = lastMessage.workflowContext
      if (workflowContext) {
        const includedCount = workflowContext.filter(
          (workflow) => workflow.included,
        ).length
        workflowContext = workflowContext.map((workflow) => {
          const included = includedCount === 1 && workflow.included
          return workflow.included === included
            ? workflow
            : { ...workflow, included }
        })
      }

      // First message of the session: select relevant skills AND workflow guides
      // in a SINGLE lightweight LLM round trip (uses the 'fast' model alias when
      // configured). Resubmitted messages keep the user's manual selections.
      const isFirstSelection =
        skillWorkflowSelectionMode === 'auto' &&
        selectedSkills === null &&
        selectedWorkflowIds === null &&
        !lastMessage.skillContext &&
        !lastMessage.workflowContext

      if (isFirstSelection) {
        if (userQuery) {
          // Deterministic keyword routing first: a skill's `trigger_keywords`
          // activate it with no LLM round trip, so small / local models still
          // get reliable skill selection even when the LLM selector below is
          // unavailable, errors, or misses an obvious match. The LLM selection
          // is unioned on top of this, never replacing it.
          const keywordSkills =
            await promptGenerator.selectSkillsByTriggers(userQuery)
          const skillBoundWorkflowId =
            await promptGenerator.selectWorkflowBySkillBindings(keywordSkills)
          const sizeFact = computeSelectionSizeFact(
            lastMessage.mentionables,
            app.vault,
          )
          if (!confirmedSelection) {
            setIsPreparingSelection(true)
            setIsSelectingSkills(true)
            let selection: PendingSelection
            try {
              let llmSkills: string[] = []
              let llmWorkflowIds: string[] = []
              const selectionRequest = await promptGenerator.buildSelection(
                userQuery,
                sizeFact,
              )
              if (selectionRequest) {
                const resolved = resolveChatModelId({ settings, alias: 'fast' })
                const { providerClient, model } = getChatModelClient({
                  modelId: resolved.modelId,
                  settings,
                  setSettings,
                })
                // Joins the unload signal; this call precedes the agent run.
                const response = await plugin.runPluginWork(
                  undefined,
                  (signal) =>
                    withAuthorizedProviderRequest(
                      selectionRequest.messages,
                      {
                        runId: lastMessage.id,
                        turnId: `${lastMessage.id}:selection`,
                      },
                      (messages) =>
                        providerClient.generateResponse(
                          model,
                          {
                            model: model.model,
                            messages,
                            response_format: selectionRequest.responseFormat,
                            stream: false,
                          },
                          { signal },
                        ),
                    ),
                )
                const content = response.choices[0]?.message?.content ?? ''
                await recordSelectionUsage(
                  lastMessage,
                  selectionRequest.messages,
                  response,
                )
                const selection = PromptGenerator.parseSelectionResponse(
                  content,
                  {
                    skills: selectionRequest.allowedSkillNames,
                    workflows: selectionRequest.allowedWorkflowIds,
                  },
                )
                llmSkills = selection.skills
                llmWorkflowIds = selection.workflows
                console.debug(
                  '[Verbex][selection] matched skills:',
                  llmSkills,
                  'workflows:',
                  llmWorkflowIds,
                )
              }
              const [allSkillContext, allWorkflowContext] = await Promise.all([
                promptGenerator.buildSkillContext(null),
                promptGenerator.buildWorkflowContext(null),
              ])
              const recommendation = standaloneSkills.resolveAutomaticSkills({
                sizeFact,
                skillBoundWorkflowId,
                llmWorkflowIds,
                keywordSkills,
                llmSkills,
                allSkills: allSkillContext,
                runnableWorkflowIds: allWorkflowContext.map(
                  (workflow) => workflow.id,
                ),
              })
              appendAuditEvent({
                turnId: lastMessage.id,
                timestamp: Date.now(),
                actor: 'system',
                kind: 'intent_classification',
                summary: `Selection complete: skills(${llmSkills.join(', ') || 'none'}), workflow(${workflowAuditText(recommendation.workflowEvidence)}), keyword(${keywordSkills.join(', ') || 'none'})`,
              })
              const recommendedSkillNames = recommendation.skillNames
              const recommendedWorkflowIds = recommendation.workflowIds.slice(
                0,
                MAX_SELECTED_WORKFLOW_GUIDES,
              )
              selection = {
                rawInputMessage: lastMessage,
                keywordSkills,
                llmSkills,
                skillBoundWorkflowId,
                llmWorkflowId: llmWorkflowIds[0] ?? null,
                recommendedSkillNames,
                recommendedWorkflowIds,
                workflowEvidence: recommendation.workflowEvidence,
                suggestedWorkflowIds: recommendation.suggestedWorkflowIds,
                suggestedSkillNames: recommendation.suggestedSkillNames,
                ...markRecommendedContexts(
                  allSkillContext,
                  allWorkflowContext,
                  recommendedSkillNames,
                  recommendedWorkflowIds,
                ),
              }
            } catch (error) {
              if (!plugin.isRuntimeActive)
                return { status: 'not_ready', reason: 'Verbex is unloading' }
              console.warn(
                '[Verbex][selection] LLM skill/workflow selection failed; falling back to keyword-matched skills only.',
                error,
              )
              const recommendedWorkflowIds = skillBoundWorkflowId
                ? [skillBoundWorkflowId]
                : []
              const recommendedSkillNames = keywordSkills
              const [allSkillContext, allWorkflowContext] = await Promise.all([
                promptGenerator.buildSkillContext(null),
                promptGenerator.buildWorkflowContext(null),
              ])
              selection = {
                rawInputMessage: lastMessage,
                keywordSkills,
                llmSkills: [],
                skillBoundWorkflowId,
                llmWorkflowId: null,
                recommendedSkillNames,
                recommendedWorkflowIds,
                workflowEvidence: {},
                suggestedWorkflowIds: [],
                suggestedSkillNames: [],
                ...markRecommendedContexts(
                  allSkillContext,
                  allWorkflowContext,
                  keywordSkills,
                  recommendedWorkflowIds,
                ),
              }
            } finally {
              setIsPreparingSelection(false)
              setIsSelectingSkills(false)
            }
            if (!shouldConfirmSelection(selection)) {
              const message = prepareConfirmedSelection(selection)
              return await handleUserMessageSubmit({
                inputChatMessages: [...inputChatMessages.slice(0, -1), message],
                resetSubmittedInput: true,
                confirmedSelection: true,
              })
            }
            setPendingSelection(selection)
            return {
              status: 'selection_required',
              messageId: lastMessage.id,
            }
          }
          setIsSelectingSkills(true)
          try {
            const selectionRequest = await promptGenerator.buildSelection(
              userQuery,
              sizeFact,
            )
            if (selectionRequest) {
              const resolved = resolveChatModelId({ settings, alias: 'fast' })
              const { providerClient, model } = getChatModelClient({
                modelId: resolved.modelId,
                settings,
                setSettings,
              })
              // Joins the unload signal; this call precedes the agent run.
              const response = await plugin.runPluginWork(undefined, (signal) =>
                withAuthorizedProviderRequest(
                  selectionRequest.messages,
                  {
                    runId: lastMessage.id,
                    turnId: `${lastMessage.id}:selection`,
                  },
                  (messages) =>
                    providerClient.generateResponse(
                      model,
                      {
                        model: model.model,
                        messages,
                        response_format: selectionRequest.responseFormat,
                        stream: false,
                      },
                      { signal },
                    ),
                ),
              )
              const content = response.choices[0]?.message?.content ?? ''
              await recordSelectionUsage(
                lastMessage,
                selectionRequest.messages,
                response,
              )
              const selection = PromptGenerator.parseSelectionResponse(
                content,
                {
                  skills: selectionRequest.allowedSkillNames,
                  workflows: selectionRequest.allowedWorkflowIds,
                },
              )
              console.debug(
                '[Verbex][selection] matched skills:',
                selection.skills,
                'workflows:',
                selection.workflows,
              )
              const [allSkillContext, allWorkflowContext] = await Promise.all([
                promptGenerator.buildSkillContext(null),
                promptGenerator.buildWorkflowContext(null),
              ])
              const recommendation = standaloneSkills.resolveAutomaticSkills({
                sizeFact,
                skillBoundWorkflowId,
                llmWorkflowIds: selection.workflows,
                keywordSkills,
                llmSkills: selection.skills,
                allSkills: allSkillContext,
                runnableWorkflowIds: allWorkflowContext.map(
                  (workflow) => workflow.id,
                ),
              })
              appendAuditEvent({
                turnId: lastMessage.id,
                timestamp: Date.now(),
                actor: 'system',
                kind: 'intent_classification',
                summary: `Selection complete: skills(${selection.skills.join(', ') || 'none'}), workflow(${workflowAuditText(recommendation.workflowEvidence)}), keyword(${keywordSkills.join(', ') || 'none'})`,
              })
              effectiveSelectedSkills = recommendation.skillNames
              skillContext = allSkillContext.map((skill) => ({
                ...skill,
                included: effectiveSelectedSkills.includes(skill.name),
              }))
              effectiveSelectedWorkflowIds = recommendation.workflowIds.slice(
                0,
                MAX_SELECTED_WORKFLOW_GUIDES,
              )
              workflowContext = await promptGenerator.buildWorkflowContext(
                effectiveSelectedWorkflowIds,
              )
            } else {
              effectiveSelectedSkills = keywordSkills
              skillContext =
                await promptGenerator.buildSkillContext(keywordSkills)
              effectiveSelectedWorkflowIds = skillBoundWorkflowId
                ? [skillBoundWorkflowId]
                : []
              workflowContext = await promptGenerator.buildWorkflowContext(
                effectiveSelectedWorkflowIds,
              )
            }
          } catch (error) {
            if (!plugin.isRuntimeActive)
              return { status: 'not_ready', reason: 'Verbex is unloading' }
            console.warn(
              '[Verbex][selection] LLM skill/workflow selection failed; falling back to keyword-matched skills only.',
              error,
            )
            effectiveSelectedSkills = keywordSkills
            skillContext =
              await promptGenerator.buildSkillContext(keywordSkills)
            effectiveSelectedWorkflowIds = skillBoundWorkflowId
              ? [skillBoundWorkflowId]
              : []
            workflowContext = await promptGenerator.buildWorkflowContext(
              effectiveSelectedWorkflowIds,
            )
          } finally {
            setIsSelectingSkills(false)
          }
        } else {
          effectiveSelectedSkills = []
          skillContext = []
          effectiveSelectedWorkflowIds = []
          workflowContext = []
        }
      } else if (userQuery && !lastMessage.skillContext) {
        // Follow-up turn (not the first selection, and not a resubmit that
        // carries an explicit skillContext): the LLM selector ran only on the
        // first message, so a skill that becomes relevant only now - the
        // conversation shifts to a new domain whose trigger_keywords appear in
        // this turn's query - would never activate. Re-run the deterministic,
        // zero-cost keyword routing for THIS query and union any newly-triggered
        // skills onto the sticky selection. Mirrors the first-turn union:
        // trigger keywords always activate their skill, never replacing prior
        // picks. The `skillContext` rebuild below (it is still undefined here)
        // then reflects the unioned set, and the reconciliation persists it to
        // `selectedSkills` so the chat bar shows the newly activated skill.
        if (skillWorkflowSelectionMode === 'locked') {
          effectiveSelectedSkills = selectedSkills ?? []
          effectiveSelectedWorkflowIds = selectedWorkflowIds ?? []
        } else {
          const keywordSkills =
            await promptGenerator.selectSkillsByTriggers(userQuery)
          effectiveSelectedSkills = [
            ...new Set([...effectiveSelectedSkills, ...keywordSkills]),
          ]
        }
      }

      if (!skillContext) {
        skillContext = await promptGenerator.buildSkillContext(
          effectiveSelectedSkills,
        )
      }
      if (!workflowContext) {
        workflowContext = await promptGenerator.buildWorkflowContext(
          effectiveSelectedWorkflowIds,
        )
      }

      // Defense in depth for stale/resubmitted messages created before workflow
      // selection became exclusive. Never inject more than one guide.
      const includedWorkflowCount = workflowContext.filter(
        (workflow) => workflow.included,
      ).length
      workflowContext = workflowContext.map((workflow) => {
        const included = includedWorkflowCount === 1 && workflow.included
        return workflow.included === included
          ? workflow
          : { ...workflow, included }
      })

      // Reconcile from the built contexts so manual toggles / resubmits win and
      // the chat bar reflects exactly what is injected.
      skillContext = standaloneSkills.reconcileSelectedSkills(
        skillContext,
        await promptGenerator.buildSkillContext([]),
        manuallySelectedSkills.current,
      )
      effectiveSelectedSkills = skillContext
        .filter((skill) => skill.included)
        .map((skill) => skill.name)
      effectiveSelectedWorkflowIds = workflowContext
        .filter((workflow) => workflow.included)
        .map((workflow) => workflow.id)

      setSelectedSkills(effectiveSelectedSkills)
      promptGenerator.setSelectedSkillNames(effectiveSelectedSkills)
      setSelectedWorkflowIds(effectiveSelectedWorkflowIds)
      setSelectedWorkflowLabels(
        workflowContext
          .filter((workflow) => workflow.included)
          .map((workflow) => workflow.name || workflow.id),
      )
      promptGenerator.setSelectedWorkflowIds(effectiveSelectedWorkflowIds)

      setChatMessages(inputChatMessages)
      window.requestAnimationFrame(() => {
        forceScrollToBottom()
      })

      const compiledMessages = submittedMessages(
        inputChatMessages,
        lastMessage.id,
        skillContext,
        workflowContext,
      )

      setChatMessages(compiledMessages)
      submitChatMutation.mutate({
        chatMessages: compiledMessages,
        conversationId: currentConversationId,
        seedToolCalls: proposalSeeds.current.get(lastMessage.id),
      })
      proposalSeeds.current.delete(lastMessage.id)
      if (resetSubmittedInput) {
        resetInputMessage()
      }
      return { status: 'submitted', messageId: lastMessage.id }
    },
    [
      app,
      plugin,
      submitChatMutation,
      captureBrowser,
      pinnedConnectorTools,
      excludedToolNames,
      currentConversationId,
      promptGenerator,
      abortActiveStreams,
      forceScrollToBottom,
      selectedSkills,
      selectedWorkflowIds,
      skillWorkflowSelectionMode,
      settings,
      setSettings,
      appendAuditEvent,
      resetInputMessage,
      prepareConfirmedSelection,
    ],
  )

  // The agentic loop / tool execution is in flight whenever the submit
  // mutation is pending or we are still picking skills for the first turn.
  const isAgentBusy =
    submitChatMutation.isPending ||
    isSelectingSkills ||
    isPreparingSelection ||
    pendingSelection !== null

  /**
   * Companion plugins use the same path as the visible chat input. This keeps
   * readiness checks, skill/workflow selection, provider tools, approval, and
   * conversation persistence in one place instead of exposing React internals.
   */
  const sendExternalMessageV2 = useCallback(
    async (
      message: string,
      options?: VerbexChatSubmissionOptions,
    ): Promise<ChatSubmissionResult> => {
      const normalized = message.trim()
      if (!normalized) {
        return { status: 'rejected', reason: 'Message is empty.' }
      }
      if (isAgentBusy) {
        return {
          status: 'busy',
          reason: 'Another chat request is already running.',
        }
      }

      const content = plainTextToEditorState(normalized)
      const externalMessage: ChatUserMessage = {
        ...resetInputMessage(),
        content,
        ...(options?.scope ? { companionScope: options.scope } : {}),
      }
      return await handleUserMessageSubmit({
        inputChatMessages: [...chatMessages, externalMessage],
        resetSubmittedInput: true,
      })
    },
    [chatMessages, handleUserMessageSubmit, isAgentBusy, resetInputMessage],
  )

  const sendExternalMessage = useCallback(
    async (message: string): Promise<boolean> => {
      const result = await sendExternalMessageV2(message)
      return result.status === 'submitted'
    },
    [sendExternalMessageV2],
  )

  const runProposals = useProposalSubmission(
    chatMessages,
    isAgentBusy,
    resetInputMessage,
    proposalSeeds,
    handleUserMessageSubmit,
  )

  // "NEXT" button: submit a "진행하세요" turn so the user can advance the agent
  // without manually typing "go ahead" / "진행하세요" each time. Reuses the same
  // submit path as the input box so skills/workflows/mentionables are honoured.
  const handleNext = useCallback(() => {
    if (isAgentBusy) return
    const message = settings.chatOptions.nextButtonMessage?.trim()
    if (!message) return
    const content = plainTextToEditorState(message)
    void handleUserMessageSubmit({
      inputChatMessages: [
        ...chatMessages,
        { ...inputMessage, content, isContinuation: true },
      ],
      resetSubmittedInput: true,
    })
  }, [
    isAgentBusy,
    settings.chatOptions.nextButtonMessage,
    chatMessages,
    inputMessage,
    handleUserMessageSubmit,
  ])

  const handleToggleSkill = useCallback((messageId: string, name: string) => {
    setChatMessages((prevChatHistory) =>
      prevChatHistory.map((message) =>
        message.role === 'user' && message.id === messageId
          ? {
              ...message,
              promptContent: null,
              skillContext: message.skillContext?.map((skill) =>
                standaloneSkills.toggleSkillContext(skill, name),
              ),
            }
          : message,
      ),
    )
  }, [])

  const handleToggleWorkflow = useCallback((messageId: string, id: string) => {
    setChatMessages((prevChatHistory) =>
      prevChatHistory.map((message) =>
        message.role === 'user' && message.id === messageId
          ? {
              ...message,
              promptContent: null,
              workflowContext: message.workflowContext?.map((workflow) => ({
                ...workflow,
                included: workflow.id === id ? !workflow.included : false,
              })),
            }
          : message,
      ),
    )
  }, [])

  const applyMutation = useMutation({
    mutationFn: async ({
      blockToApply,
      path,
      strategy,
      sectionHeading,
      before,
    }: {
      blockToApply: string
      path: string
      strategy: ApplyStrategy
      sectionHeading?: string
      before?: string
    }) => {
      const outcome =
        before !== undefined
          ? await plugin.verbexController.applyBoundedSection({
              runId: `chat-${currentConversationId}`,
              path,
              before,
              block: blockToApply,
            })
          : await plugin.verbexController.applyDraftToNote({
              runId: `chat-${currentConversationId}`,
              path,
              content: blockToApply,
              strategy,
              sectionHeading,
            })
      new Notice(applyResultText(outcome))
    },
    onError: (error) => {
      new Notice(error.message)
      console.error('Failed to apply draft', error)
    },
  })

  const handleApply = useApplyTarget(app, applyMutation.mutate)

  // Re-sync selected skills into a freshly created promptGenerator (e.g. after settings change)
  useEffect(() => {
    if (selectedSkills !== null) {
      promptGenerator.setSelectedSkillNames(selectedSkills)
    }
  }, [promptGenerator, selectedSkills])

  // Re-sync selected workflows into a freshly created promptGenerator
  useEffect(() => {
    if (selectedWorkflowIds !== null) {
      promptGenerator.setSelectedWorkflowIds(selectedWorkflowIds)
    }
  }, [promptGenerator, selectedWorkflowIds])

  // Keep the in-chat picker catalog (and the workflow badge labels) in sync with
  // the active selection, so changing skills/workflows mid-chat is reflected
  // immediately and applies to the next turn (요구 4-2).
  useEffect(() => {
    if (selectedSkills === null && selectedWorkflowIds === null) {
      console.debug(
        '[Verbex][chat][catalog] skipped because no selection state exists yet',
      )
      setAvailableSkills([])
      setAvailableWorkflows([])
      return
    }
    let cancelled = false
    void (async () => {
      if (!(await plugin.ensureReady({ notify: false }))) {
        console.warn(
          '[Verbex][chat][catalog] skipped because Verbex is not ready',
          plugin.getReadinessSnapshot(),
        )
        setAvailableSkills([])
        setAvailableWorkflows([])
        return
      }
      try {
        const [skills, workflows, diagnostics] = await Promise.all([
          promptGenerator.buildSkillContext(selectedSkills),
          promptGenerator.buildWorkflowContext(selectedWorkflowIds),
          promptGenerator.getSkillDiagnostics(),
        ])
        if (cancelled) return
        console.debug('[Verbex][chat][catalog] loaded', {
          skillsFolder: plugin.settings.skillsFolder,
          workflowsFolder: plugin.settings.workflowsFolder,
          promptsFolder: plugin.settings.promptsFolder,
          skillCount: skills.length,
          skillNames: skills.map((skill) => skill.name),
          workflowCount: workflows.length,
          workflowIds: workflows.map((workflow) => workflow.id),
          skillDiagnosticCount: diagnostics.length,
        })
        const notifySkillDiagnostic = createSkillDiagnosticNotifier(
          seenSkillDiagnosticKeys,
          (message) => new Notice(message),
        )
        diagnostics.forEach(notifySkillDiagnostic)
        setAvailableSkills(skills)
        setAvailableWorkflows(workflows)
        setSelectedWorkflowLabels(
          workflows
            .filter((workflow) => workflow.included)
            .map((workflow) => workflow.name || workflow.id),
        )
      } catch (error) {
        if (cancelled) return
        console.error(
          '[Verbex][chat][catalog] failed to load skill/workflow catalogs',
          {
            skillsFolder: plugin.settings.skillsFolder,
            workflowsFolder: plugin.settings.workflowsFolder,
            promptsFolder: plugin.settings.promptsFolder,
          },
          error,
        )
        setAvailableSkills([])
        setAvailableWorkflows([])
        setSelectedWorkflowLabels([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [plugin, promptGenerator, selectedSkills, selectedWorkflowIds])

  // Toggle a skill on/off for the next turn from the in-chat picker.
  const handleActiveSkillToggle = useCallback(
    (name: string) => {
      setSkillWorkflowSelectionMode('locked')
      const next = standaloneSkills.toggledManualNames(
        name,
        availableSkills,
        manuallySelectedSkills.current,
      )
      setSelectedSkills(next)
      promptGenerator.setSelectedSkillNames(next)
    },
    [availableSkills, promptGenerator],
  )

  // Select one workflow guide (or toggle the active one off) for the next turn.
  const handleActiveWorkflowToggle = useCallback(
    (id: string) => {
      setSkillWorkflowSelectionMode('locked')
      const alreadyActive = availableWorkflows.some(
        (workflow) => workflow.id === id && workflow.included,
      )
      const next = alreadyActive ? [] : [id]
      setSelectedWorkflowIds(next)
      promptGenerator.setSelectedWorkflowIds(next)
    },
    [availableWorkflows, promptGenerator],
  )

  const handleSwitchSelectionToAuto = useCallback(() => {
    manuallySelectedSkills.current.clear()
    setSkillWorkflowSelectionMode('auto')
    setSelectedSkills(null)
    promptGenerator.setSelectedSkillNames(null)
    setSelectedWorkflowIds(null)
    setSelectedWorkflowLabels([])
    promptGenerator.setSelectedWorkflowIds(null)
    setPendingSelection(null)
  }, [promptGenerator])

  const handlePendingSkillToggle = useCallback((name: string) => {
    setPendingSelection((prev) =>
      prev
        ? {
            ...prev,
            skillContext: prev.skillContext.map((skill) =>
              standaloneSkills.toggleSkillContext(skill, name),
            ),
          }
        : prev,
    )
  }, [])

  const handlePendingWorkflowToggle = useCallback((id: string) => {
    setPendingSelection((prev) => {
      if (!prev) return prev
      const alreadyActive = prev.workflowContext.some(
        (workflow) => workflow.id === id && workflow.included,
      )
      return {
        ...prev,
        workflowContext: prev.workflowContext.map((workflow) => ({
          ...workflow,
          included: !alreadyActive && workflow.id === id,
        })),
      }
    })
  }, [])

  const handleConfirmPendingSelection = useCallback(() => {
    if (!pendingSelection) return
    const message = prepareConfirmedSelection(pendingSelection)
    void handleUserMessageSubmit({
      inputChatMessages: [...chatMessages, message],
      resetSubmittedInput: true,
      confirmedSelection: true,
    })
  }, [
    chatMessages,
    handleUserMessageSubmit,
    pendingSelection,
    prepareConfirmedSelection,
  ])

  const handleCancelPendingSelection = useCallback(() => {
    setPendingSelection(null)
    setIsPreparingSelection(false)
    setIsSelectingSkills(false)
  }, [])

  useEffect(() => {
    setFocusedMessageId(inputMessage.id)
  }, [])

  useDraftActiveFile(app, focusedMessageId, inputMessage.id, setInputMessage)

  const { documents: offscreenDocs, refresh: refreshOffscreenDocs } =
    useOffscreenDocuments(
      plugin.nativeProviderHost,
      app.workspace,
      currentConversationId,
      isAgentBusy,
    )

  const handleOpenOffscreenDoc = useCallback(
    async (doc: OffscreenDoc) => {
      try {
        await plugin.nativeProviderHost.revealEdit(
          {
            providerId: doc.providerId,
            tool: '',
            path: doc.path,
            sessionId: doc.sessionId,
            incarnation: doc.incarnation,
            revisionBefore: 0,
            undoAvailable: false,
            changedPages: [],
            preview: [],
            visible: false,
          },
          currentConversationId,
        )
      } catch {
        const file = app.vault.getAbstractFileByPath(doc.path)
        if (file instanceof TFile) {
          await app.workspace.getLeaf('tab').openFile(file)
        }
      }
      await refreshOffscreenDocs()
    },
    [
      plugin.nativeProviderHost,
      currentConversationId,
      app,
      refreshOffscreenDocs,
    ],
  )

  const handleRequestSaveDoc = useCallback(
    (doc: OffscreenDoc) => {
      void handleUserMessageSubmit({
        inputChatMessages: [
          ...chatMessages,
          {
            ...inputMessage,
            content: plainTextToEditorState(saveDocumentRequest(doc.path)),
          },
        ],
        resetSubmittedInput: true,
      })
    },
    [chatMessages, inputMessage, handleUserMessageSubmit],
  )

  const handleDiscardOffscreenDoc = useCallback(
    async (doc: OffscreenDoc) => {
      if (!(await confirmDiscardAgentChanges(app, doc.path))) return false
      try {
        await plugin.nativeProviderHost.discardAgentChanges(
          {
            path: doc.path,
            sessionId: doc.sessionId,
            incarnation: doc.incarnation,
            documentEpoch: doc.documentEpoch,
          },
          doc.providerId,
          currentConversationId,
        )
        return true
      } finally {
        await refreshOffscreenDocs()
      }
    },
    [
      app,
      plugin.nativeProviderHost,
      currentConversationId,
      refreshOffscreenDocs,
    ],
  )

  useImperativeHandle(
    ref,
    () => ({
      openNewChat: (selectedBlock?: MentionableBlockData) =>
        handleNewChat(selectedBlock),
      sendMessage: sendExternalMessage,
      sendMessageV2: sendExternalMessageV2,
      addSelectionToChat: (selectedBlock: MentionableBlockData) => {
        const mentionable: Omit<MentionableBlock, 'id'> = {
          type: 'block',
          ...selectedBlock,
        }

        setAddedBlock(mentionable)

        if (focusedMessageId === inputMessage.id) {
          setInputMessage((prevInputMessage) => {
            const mentionableKey = getMentionableKey(
              serializeMentionable(mentionable),
            )
            // Check if mentionable already exists
            if (
              prevInputMessage.mentionables.some(
                (m) =>
                  getMentionableKey(serializeMentionable(m)) === mentionableKey,
              )
            ) {
              return prevInputMessage
            }
            return {
              ...prevInputMessage,
              mentionables: [...prevInputMessage.mentionables, mentionable],
            }
          })
        } else {
          setChatMessages((prevChatHistory) =>
            prevChatHistory.map((message) => {
              if (message.id === focusedMessageId && message.role === 'user') {
                const mentionableKey = getMentionableKey(
                  serializeMentionable(mentionable),
                )
                // Check if mentionable already exists
                if (
                  message.mentionables.some(
                    (m) =>
                      getMentionableKey(serializeMentionable(m)) ===
                      mentionableKey,
                  )
                ) {
                  return message
                }
                return {
                  ...message,
                  mentionables: [...message.mentionables, mentionable],
                }
              }
              return message
            }),
          )
        }
      },
      focusMessage: () => {
        if (!focusedMessageId) return
        chatUserInputRefs.current.get(focusedMessageId)?.focus()
      },
    }),
    [
      focusedMessageId,
      handleNewChat,
      inputMessage.id,
      sendExternalMessage,
      sendExternalMessageV2,
      setAddedBlock,
      setInputMessage,
    ],
  )

  return (
    <div className="verbex-chat-container">
      <div className="verbex-chat-header">
        <h1 className="verbex-chat-header-title">{t('ui.Chat.chat')}</h1>
        <div className="verbex-chat-header-buttons">
          <SessionExportButton
            conversationId={currentConversationId}
            title={
              chatList.find((chat) => chat.id === currentConversationId)
                ?.title ?? t('ui.Chat.currentConversation')
            }
            messages={chatMessages}
            auditLog={auditLog}
            inProgress={submitChatMutation.isPending}
          />
          <button
            onClick={() => handleNewChat()}
            className="clickable-icon"
            aria-label={t('ui.Chat.newChat')}
          >
            <Plus size={18} />
          </button>
          <ChatListDropdown
            chatList={chatList}
            currentConversationId={currentConversationId}
            onSelect={async (conversationId) => {
              if (conversationId === currentConversationId) return
              await handleLoadConversation(conversationId)
            }}
            onDelete={async (conversationId) => {
              void plugin.nativeProviderHost?.releaseDocuments(conversationId)
              await deleteConversation(conversationId)
              if (conversationId === currentConversationId) {
                const nextConversation = chatList.find(
                  (chat) => chat.id !== conversationId,
                )
                if (nextConversation) {
                  void handleLoadConversation(nextConversation.id)
                } else {
                  handleNewChat()
                }
              }
            }}
            onUpdateTitle={async (conversationId, newTitle) => {
              await updateConversationTitle(conversationId, newTitle)
            }}
          >
            <History size={18} />
          </ChatListDropdown>
          <RecordCleanupButton
            conversationId={currentConversationId}
            onChatsDeleted={refreshChatList}
          />
          <button
            onClick={() => {
              new TemplateSectionModal(app).open()
            }}
            className="clickable-icon"
            aria-label={t('ui.Chat.promptTemplates')}
          >
            <Book size={18} />
          </button>
        </div>
      </div>
      <AuditTracePanel auditLog={auditLog} />
      <SessionGrants
        host={plugin.nativeProviderHost}
        conversationId={currentConversationId}
      />
      {initializationError && (
        <div className="verbex-settings-callout">
          {t('ui.Chat.verbexInitializationFailed')}
          {initializationError}
          {t('ui.Chat.reloadObsidianAndTryAgain')}
        </div>
      )}
      {unreadableChatCount > 0 && (
        <div className="verbex-settings-callout">
          {t('ui.Chat.unreadableConversationRecords')}
          {unreadableChatCount}
          {t('ui.Chat.excludedFromTheListFilesWereNot')}
        </div>
      )}
      {(isSelectingSkills ||
        isPreparingSelection ||
        pendingSelection !== null ||
        (selectedSkills !== null && selectedSkills.length > 0) ||
        selectedWorkflowLabels.length > 0 ||
        availableSkills.length > 0 ||
        availableWorkflows.length > 0) && (
        <div className="verbex-skill-bar">
          <Wand2 size={12} className="verbex-skill-bar-icon" />
          {isPreparingSelection ? (
            <span className="verbex-skill-bar-loading">
              {t('ui.Chat.selecting')}
            </span>
          ) : pendingSelection ? (
            <div className="verbex-selection-confirm">
              <div className="verbex-selection-confirm-header">
                <span className="verbex-skill-bar-loading">
                  {t('ui.Chat.reviewRecommended')}
                </span>
                <button
                  type="button"
                  className="verbex-skill-bar-edit"
                  onClick={handleConfirmPendingSelection}
                >
                  <span>{t('ui.Chat.proceed')}</span>
                </button>
                <button
                  type="button"
                  className="verbex-skill-bar-edit"
                  onClick={handleCancelPendingSelection}
                >
                  <span>{t('ui.InlinePromptModal.cancel')}</span>
                </button>
              </div>
              <SelectionEvidencePicker
                skills={pendingSelection.skillContext}
                workflows={pendingSelection.workflowContext}
                evidence={pendingSelection.workflowEvidence}
                suggestedSkills={pendingSelection.suggestedSkillNames}
                onSkillToggle={handlePendingSkillToggle}
                onWorkflowToggle={handlePendingWorkflowToggle}
              />
            </div>
          ) : (
            <>
              {(selectedSkills ?? []).map((name) => (
                <SelectedSkillBadge
                  key={`skill:${name}`}
                  skill={
                    availableSkills.find((skill) => skill.name === name) ?? {
                      name,
                      included: true,
                      path: '',
                      overview: '',
                    }
                  }
                />
              ))}
              {selectedWorkflowLabels.map((name) => (
                <span key={`workflow:${name}`} className="verbex-skill-badge">
                  {t('ui.Chat.workflow', { p0: name })}
                </span>
              ))}
              {selectedSkills !== null &&
                selectedSkills.length === 0 &&
                selectedWorkflowLabels.length === 0 && (
                  <span className="verbex-skill-bar-loading">
                    {t('ui.Chat.noActiveContext')}
                  </span>
                )}
              <ChatContextSelector
                onOpen={() => refreshSkillAvailability((value) => value + 1)}
                skills={availableSkills}
                workflows={availableWorkflows}
                mode={skillWorkflowSelectionMode}
                onToggleSkill={handleActiveSkillToggle}
                onToggleWorkflow={handleActiveWorkflowToggle}
                onSwitchToAuto={handleSwitchSelectionToAuto}
              />
            </>
          )}
        </div>
      )}
      <div className="verbex-chat-messages" ref={chatMessagesRef}>
        {groupedChatMessages.map((messageOrGroup, index) =>
          !Array.isArray(messageOrGroup) ? (
            <UserMessageItem
              key={messageOrGroup.id}
              message={messageOrGroup}
              contextMessages={chatMessages}
              chatUserInputRef={(ref) =>
                registerChatUserInputRef(messageOrGroup.id, ref)
              }
              onInputChange={(content) => {
                setChatMessages((prevChatHistory) =>
                  prevChatHistory.map((msg) =>
                    msg.role === 'user' && msg.id === messageOrGroup.id
                      ? {
                          ...msg,
                          content,
                        }
                      : msg,
                  ),
                )
              }}
              onSubmit={(content) => {
                if (isAgentBusy) return
                if (editorStateToPlainText(content).trim() === '') return
                void handleUserMessageSubmit({
                  inputChatMessages: [
                    ...groupedChatMessages
                      .slice(0, index)
                      .flatMap((messageOrGroup): ChatMessage[] =>
                        !Array.isArray(messageOrGroup)
                          ? [messageOrGroup]
                          : messageOrGroup,
                      ),
                    {
                      role: 'user',
                      content: content,
                      promptContent: null,
                      id: messageOrGroup.id,
                      mentionables: messageOrGroup.mentionables,
                      contextModeOverride: messageOrGroup.contextModeOverride,
                    },
                  ],
                })
                chatUserInputRefs.current.get(inputMessage.id)?.focus()
              }}
              onFocus={() => {
                setFocusedMessageId(messageOrGroup.id)
              }}
              onMentionablesChange={(mentionables) => {
                setChatMessages((prevChatHistory) =>
                  prevChatHistory.map((msg) =>
                    msg.id === messageOrGroup.id
                      ? { ...msg, mentionables }
                      : msg,
                  ),
                )
              }}
              onToggleSkill={(name) =>
                handleToggleSkill(messageOrGroup.id, name)
              }
              onToggleWorkflow={(id) =>
                handleToggleWorkflow(messageOrGroup.id, id)
              }
              onResubmitWithSelectedContext={() => {
                if (isAgentBusy) return
                const resubmittedMessage: ChatUserMessage = {
                  ...messageOrGroup,
                  promptContent: null,
                }
                const selectedSkillNames =
                  resubmittedMessage.skillContext
                    ?.filter((skill) => skill.included)
                    .map((skill) => skill.name) ?? []
                setSelectedSkills(selectedSkillNames)
                promptGenerator.setSelectedSkillNames(selectedSkillNames)
                if (resubmittedMessage.workflowContext) {
                  const selectedWorkflowIds = resubmittedMessage.workflowContext
                    .filter((workflow) => workflow.included)
                    .map((workflow) => workflow.id)
                  if (selectedWorkflowIds.length > 1) {
                    selectedWorkflowIds.length = 0
                  }
                  const selectedWorkflowLabels =
                    resubmittedMessage.workflowContext
                      .filter(
                        (workflow) => workflow.id === selectedWorkflowIds[0],
                      )
                      .map((workflow) => workflow.name || workflow.id)
                  resubmittedMessage.workflowContext =
                    resubmittedMessage.workflowContext.map((workflow) => ({
                      ...workflow,
                      included: workflow.id === selectedWorkflowIds[0],
                    }))
                  setSelectedWorkflowIds(selectedWorkflowIds)
                  setSelectedWorkflowLabels(selectedWorkflowLabels)
                  promptGenerator.setSelectedWorkflowIds(selectedWorkflowIds)
                }
                void handleUserMessageSubmit({
                  inputChatMessages: [
                    ...groupedChatMessages
                      .slice(0, index)
                      .flatMap((messageOrGroup): ChatMessage[] =>
                        !Array.isArray(messageOrGroup)
                          ? [messageOrGroup]
                          : messageOrGroup,
                      ),
                    resubmittedMessage,
                  ],
                })
              }}
            />
          ) : (
            <AssistantToolMessageGroupItem
              key={messageOrGroup.at(0)?.id}
              messages={messageOrGroup}
              contextMessages={groupedChatMessages
                .slice(0, index + 1)
                .flatMap((messageOrGroup): ChatMessage[] =>
                  !Array.isArray(messageOrGroup)
                    ? [messageOrGroup]
                    : messageOrGroup,
                )}
              conversationId={currentConversationId}
              isApplying={applyMutation.isPending}
              allMessages={chatMessages}
              isStreaming={isAgentBusy}
              onRunProposals={(...args) => void runProposals(...args)}
              onApply={(...args) => void handleApply(...args)}
              onToolMessageUpdate={(...args) => {
                void handleToolMessageUpdate(...args)
              }}
              onCommitUpdate={handleCommitUpdate}
            />
          ),
        )}
        <QueryProgress state={queryProgress} />
        <OffscreenUnsavedCard
          documents={offscreenDocs}
          onOpen={handleOpenOffscreenDoc}
          onRequestSave={handleRequestSaveDoc}
          onDiscard={handleDiscardOffscreenDoc}
        />
        {showContinueResponseButton && (
          <div className="verbex-continue-response-button-container">
            <button
              className="verbex-continue-response-button"
              onClick={handleContinueResponse}
              disabled={isAgentBusy}
            >
              <div>{t('ui.Chat.continueResponse')}</div>
            </button>
          </div>
        )}
        {chatMessages.length > 0 && !showContinueResponseButton && (
          <div className="verbex-next-button-container">
            <button
              className="verbex-next-button"
              onClick={handleNext}
              disabled={isAgentBusy}
              aria-label={t('ui.Chat.continueToNext')}
            >
              <div>{t('ui.Chat.next')}</div>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        {submitChatMutation.isPending && (
          <button onClick={abortActiveStreams} className="verbex-stop-gen-btn">
            <CircleStop size={16} />
            <div>{t('ui.Chat.stopGeneration')}</div>
          </button>
        )}
      </div>
      <PluginApprovalBanner plugin={plugin} app={app} />
      <ChatModelReadinessBanner app={app} plugin={plugin} settings={settings} />
      <StarterAssetsBanner app={app} plugin={plugin} settings={settings} />
      {browserControl}
      <ChatUserInput
        key={inputMessage.id} // this is needed to clear the editor when the user submits a new message
        ref={(ref) => registerChatUserInputRef(inputMessage.id, ref)}
        initialSerializedEditorState={inputMessage.content}
        onChange={(content) => {
          setInputMessage((prevInputMessage) => ({
            ...prevInputMessage,
            content,
          }))
        }}
        onSubmit={(content) => {
          if (isAgentBusy) return
          if (editorStateToPlainText(content).trim() === '') return
          void handleUserMessageSubmit({
            inputChatMessages: [...chatMessages, { ...inputMessage, content }],
            resetSubmittedInput: true,
          })
        }}
        onFocus={() => {
          setFocusedMessageId(inputMessage.id)
        }}
        pinnedConnectorTools={pinnedConnectorTools}
        onPinnedConnectorToolsChange={setPinnedConnectorTools}
        excludedToolNames={excludedToolNames}
        onExcludedToolNamesChange={setExcludedToolNames}
        mentionables={inputMessage.mentionables}
        contextModeOverride={inputMessage.contextModeOverride}
        onContextModeChange={(contextModeOverride) => {
          setInputMessage((prevInputMessage) => ({
            ...prevInputMessage,
            contextModeOverride,
          }))
        }}
        setMentionables={(mentionables) => {
          setInputMessage((prevInputMessage) => ({
            ...prevInputMessage,
            mentionables,
          }))
        }}
        autoFocus
        addedBlockKey={addedBlockKey}
      />
    </div>
  )
})

Chat.displayName = 'Chat'

export default Chat
