import { SerializedEditorState } from 'lexical'

import type { ContextMode } from '../context/contextPolicy'
import { BatchContract } from '../core/batch/contracts'
import type { CensusReport } from '../core/census/types'
import { SelectEmbedding } from '../database/schema'
import type { HwpEditScope } from '../provider/contract'
import { StepVerificationSpec } from '../verbex/types'

import { ChatModel } from './chat-model.types'
import { ContentPart, RequestProviderMetadata } from './llm/request'
import { Annotation, ResponseUsage } from './llm/response'
import { Mentionable, SerializedMentionable } from './mentionable'
import { ToolCallRequest, ToolCallResponse } from './tool-call.types'

export type ChatUserMessage = {
  role: 'user'
  verbexCallUsage?: import('../core/llm/usageObserver').ChatCallUsage[]
  content: SerializedEditorState | null
  promptContent: string | ContentPart[] | null
  id: string
  mentionables: Mentionable[]
  /** Set only by the NEXT button; typed continuations use text heuristics. */
  isContinuation?: boolean
  skillContext?: ChatSkillContextItem[]
  workflowContext?: ChatWorkflowContextItem[]
  excludedSimilaritySearchResultIds?: number[]
  similaritySearchResults?: (Omit<SelectEmbedding, 'embedding'> & {
    similarity: number
  })[]
  /** Snapshot of settings.chatModelId at the time this turn was (re)submitted. */
  modelId?: string
  /** Optional one-turn override of the persistent first-turn context policy. */
  pinnedConnectorTools?: string[]
  /** Conversation-wide tool choices; the pinned field keeps its storage key. */
  excludedToolNames?: string[]
  contextModeOverride?: ContextMode
  /** Host-trusted scope supplied by a companion editor (for example KORDOC). */
  companionScope?: HwpEditScope
  browserContext?: import('../provider/interop/browserContext').BrowserTurnContext
}

export type ChatSkillContextItem = {
  name: string
  path: string
  overview: string
  /** Workflow filename/id declared by the skill frontmatter. */
  workflow?: string
  /** Full SKILL.md body, injected into the prompt when the skill is included. */
  instructions?: string
  /** Frontmatter `applies_to`: editor contexts (markdown/canvas/base) the skill
   *  targets. Enforced at injection so a context-mismatched skill is dropped. */
  appliesTo?: string[]
  /** Frontmatter `allowed-tools`: when non-empty, injected as a tool-scope
   *  directive limiting the agent while the skill is active. */
  allowedTools?: string[]
  tools?: string[]
  /** Frontmatter `preferred-tools`: reserved after the current document core,
   *  never required (fnEF51 WP8(a)). */
  preferredTools?: string[]
  requiredPlugins?: string[]
  /** Trigger declarations used for deterministic routing. */
  triggerKeywords?: string[]
  /** Chosen explicitly by the user, not recommended automatically. */
  manuallySelected?: boolean
  crossDocument?: boolean
  /** Frontmatter `standalone`: see SkillFrontmatter.standalone. */
  standalone?: boolean
  /** Claude Code `disable-model-invocation`: only explicit user selection may activate this skill. */
  disableModelInvocation?: boolean
  batch?: BatchContract
  included: boolean
}

export type ChatWorkflowContextItem = {
  id: string
  name: string
  overview: string
  guide?: string
  schemas?: import('../verbex/types').WorkflowDefinition['schemas']
  profiles?: import('../verbex/types').WorkflowDefinition['profiles']
  checklist?: import('../verbex/types').WorkflowDefinition['checklist']
  /** Mechanical output contract enforced before an agent write is approved. */
  verification?: StepVerificationSpec
  /** Step-scoped contracts retained for cursor selection and write validation. */
  steps?: {
    id: string
    title: string
    description?: string
    tool?: string
    openOutput?: boolean
    outputPath?: string
    outputArtifact?: string
    prompt?: string
    dependsOn: string[]
    verification?: StepVerificationSpec
    batch?: BatchContract
    targetLabels?: import('../verbex/types').IndexTargetLabels
  }[]
  /** Whether a failed write contract should be returned to the model to retry. */
  selfCorrection?: boolean
  /**
   * When true, treaty write tools in this workflow skip the per-write Diff
   * dialog/countdown for safe writes while dangerous changes still require
   * explicit approval.
   */
  autoApply?: boolean
  included: boolean
}
/** One line of the §6.3 large-file status card checklist. */
export type LargeFileCardStep = {
  key: string
  label: string
  status: 'done' | 'active' | 'pending' | 'failed' | 'cancelled'
  /** Progress detail for the active/done step, e.g. "7/7". */
  detail?: string
}

/**
 * §6.3 single updatable status card. One card replaces the per-chunk internal
 * tool messages for a whole-document analysis or transform, so the transcript
 * shows one work-focused card instead of a running log.
 */
export type LargeFileCardState = {
  operation: 'analysis' | 'transform'
  path: string
  title: string
  steps: LargeFileCardStep[]
  done: boolean
  /** Optional for backward compatibility with older persisted chat history. */
  outcome?: 'running' | 'completed' | 'failed' | 'cancelled'
}

export type ChatAssistantMessage = {
  role: 'assistant'
  content: string
  reasoning?: string
  annotations?: Annotation[]
  toolCallRequests?: ToolCallRequest[]
  id: string
  metadata?: {
    usage?: ResponseUsage
    model?: ChatModel // TODO: migrate legacy data to new model type
  }
  providerMetadata?: RequestProviderMetadata
  verbexCallUsage?: import('../core/llm/usageObserver').ChatCallUsage[]
  /**
   * Marks a transient one-line tool-outcome summary rendered in the chat for
   * the user (요구 3-3). These are display-only and must be excluded from the
   * request history sent back to the model, otherwise they replay as fake
   * assistant turns and pollute multi-turn context.
   */
  verbexToolSummary?: boolean
  verbexCensusReport?: CensusReport & { responseMessageId: string }
  verbexChangeLedger?: { applied: number }
  /**
   * §6.3: when present, this assistant message renders as a single updatable
   * large-file status card instead of text. Display-only — excluded from the
   * request history like {@link verbexToolSummary}.
   */
  verbexLargeFileCard?: LargeFileCardState
  verbexRunState?: {
    status: 'failed' | 'cancelled'
    label: string
    detail?: string
  }
}
export type ChatToolMessage = {
  role: 'tool'
  id: string
  toolCalls: {
    request: ToolCallRequest
    response: ToolCallResponse
    /** Typed receipt of a provider working-copy edit, for the change card. */
    sessionEdit?: import('../provider/interop/sessionProtocol').SessionEditFact
    commit?: import('../provider/interop/commitStatus').CommitFact
  }[]
}

export type ChatMessage =
  | ChatUserMessage
  | ChatAssistantMessage
  | ChatToolMessage

export type AssistantToolMessageGroup = (
  | ChatAssistantMessage
  | ChatToolMessage
)[]

export type SerializedChatUserMessage = {
  role: 'user'
  verbexCallUsage?: ChatUserMessage['verbexCallUsage']
  content: SerializedEditorState | null
  promptContent: string | ContentPart[] | null
  id: string
  mentionables: SerializedMentionable[]
  skillContext?: ChatSkillContextItem[]
  workflowContext?: ChatWorkflowContextItem[]
  excludedSimilaritySearchResultIds?: number[]
  similaritySearchResults?: (Omit<SelectEmbedding, 'embedding'> & {
    similarity: number
  })[]
  modelId?: string
  pinnedConnectorTools?: string[]
  excludedToolNames?: string[]
  contextModeOverride?: ContextMode
  companionScope?: HwpEditScope
}
export type SerializedChatAssistantMessage = {
  role: 'assistant'
  content: string
  reasoning?: string
  annotations?: Annotation[]
  toolCallRequests?: ToolCallRequest[]
  id: string
  metadata?: {
    usage?: ResponseUsage
    model?: ChatModel // TODO: migrate legacy data to new model type
  }
  providerMetadata?: RequestProviderMetadata
  verbexCallUsage?: ChatAssistantMessage['verbexCallUsage']
  verbexToolSummary?: boolean
  verbexCensusReport?: ChatAssistantMessage['verbexCensusReport']
  verbexChangeLedger?: ChatAssistantMessage['verbexChangeLedger']
  /**
   * §6.3: when present, this assistant message renders as a single updatable
   * large-file status card instead of text. Display-only — excluded from the
   * request history like {@link verbexToolSummary}.
   */
  verbexLargeFileCard?: LargeFileCardState
  verbexRunState?: ChatAssistantMessage['verbexRunState']
}
export type SerializedChatToolMessage = {
  role: 'tool'
  toolCalls: {
    request: ToolCallRequest
    response: ToolCallResponse
    /** Typed receipt of a provider working-copy edit, for the change card. */
    sessionEdit?: import('../provider/interop/sessionProtocol').SessionEditFact
    commit?: import('../provider/interop/commitStatus').CommitFact
  }[]
  id: string
}
export type SerializedChatMessage =
  | SerializedChatUserMessage
  | SerializedChatAssistantMessage
  | SerializedChatToolMessage

export type AuditEvent = {
  /** Chat user-message id; omitted for legacy records. */
  turnId?: string
  timestamp: number
  actor: 'user' | 'agent' | 'system'
  kind:
    | 'intent_classification'
    | 'tool_permission_decision'
    | 'checkpoint'
    | 'retry'
    | 'validation_override_accepted'
    | 'context_retrieval'
    | 'context_exclusion'
    | 'context_eviction'
    | 'context_compaction'
    | 'tool_call'
    | 'tool_exposure'
    | 'turn_facts'
    | 'coverage_final_notice'
  summary: string
  refId?: string
  /** Aggregate, non-content facts only. Never store prompts or tool payloads. */
  details?: Record<string, number | string | boolean>
}

/** Persisted as one aggregate record per chat turn. */
export type AuditTurnRecord = {
  turnId: string
  startedAt: number
  completedAt?: number
  events: AuditEvent[]
}

export type SkillWorkflowSelectionMode = 'auto' | 'locked'

export type ChatConversation = {
  schemaVersion: number
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: SerializedChatMessage[]
  auditLog?: AuditTurnRecord[]
  skillWorkflowSelectionMode?: SkillWorkflowSelectionMode
  selectedSkillNames?: string[]
  selectedWorkflowIds?: string[]
}
export type ChatConversationMeta = {
  schemaVersion: number
  id: string
  title: string
  createdAt: number
  updatedAt: number
}
