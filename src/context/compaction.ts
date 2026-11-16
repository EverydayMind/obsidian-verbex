import { PRIVATE_TOOL_TEXT } from '../core/llm/privateToolTranscript'
import { protectedResponsesStart } from '../core/llm/responsesReplay'
import { hasModelMarker, modelMarker } from '../i18n/modelMarkers'
import { VerbexSettings } from '../settings/schema/setting.types'
import type { ConnectorDisclosure } from '../types/llm/request'
import { tokenCount } from '../utils/llm/token'

import { extractUserRequest, findPinnedTaskIndex } from './taskPinning'

/**
 * Context compaction (PRD §10).
 *
 * When a run's accumulated conversation approaches `maxContextTokens`, older
 * turns are summarized into a single note so newer turns and freshly retrieved
 * context still fit. Compaction triggers at COMPACT_TRIGGER_RATIO of the
 * budget; the most recent turns are always kept verbatim.
 *
 * The summarizer (an LLM call) is injected so this module stays pure and
 * unit-testable without a live provider.
 */

export const COMPACT_TRIGGER_RATIO = 0.9
const DEFAULT_KEEP_RECENT = 4
/** Avoid repeated lossy merge calls until accumulated summaries are material. */
export const SUMMARY_MERGE_TRIGGER_RATIO = 0.1
export const SUMMARY_MERGE_FLOOR_TOKENS = 256
export const MIN_MERGED_SUMMARY_RATIO = 0.1
const MIN_MERGED_SUMMARY_FLOOR_TOKENS = 32

export type CompactableMessage = {
  role: string
  content: string
  [key: string]: unknown
}

export type CompactionDecision = {
  shouldCompact: boolean
  estimatedTokens: number
  thresholdTokens: number
  ratio: number
}

export type CompactionResult<T extends CompactableMessage> = {
  messages: T[]
  /** The generated summary text, or null when nothing was compacted. */
  summary: string | null
  /** Number of original messages folded into the summary. */
  compactedCount: number
}

export type Summarizer = (
  transcript: string,
  disclosure?: ConnectorDisclosure,
) => Promise<string>

export function compactedDisclosure(
  messages: CompactableMessage[],
  connectorId = 'context-compaction',
): ConnectorDisclosure | undefined {
  const paths = new Set<string>()
  const sources = new Set<string>()
  let unattributedFiles = 0
  let present = false
  for (const message of messages) {
    if (message.privateTranscript || message.disclosure === undefined) continue
    const value = message.disclosure as ConnectorDisclosure | null
    if (
      !value ||
      typeof value.connectorId !== 'string' ||
      (value.sourceConnectorIds !== undefined &&
        (!Array.isArray(value.sourceConnectorIds) ||
          value.sourceConnectorIds.some(
            (source) => typeof source !== 'string',
          ))) ||
      !Array.isArray(value.canonicalVaultPaths) ||
      value.canonicalVaultPaths.some((path) => typeof path !== 'string') ||
      !Number.isSafeInteger(value.unattributedFiles) ||
      value.unattributedFiles < 0
    )
      throw new Error('Invalid disclosure in compacted transcript.')
    present = true
    for (const source of value.sourceConnectorIds?.length
      ? value.sourceConnectorIds
      : [value.connectorId])
      sources.add(source)
    for (const path of value.canonicalVaultPaths) paths.add(path)
    unattributedFiles += value.unattributedFiles
    if (!Number.isSafeInteger(unattributedFiles))
      throw new Error('Compacted disclosure exceeds accounting limits.')
  }
  return present
    ? {
        connectorId,
        sourceConnectorIds: [...sources],
        canonicalVaultPaths: [...paths],
        unattributedFiles,
      }
    : undefined
}

type TokenCounter = (text: string) => Promise<number>

export class ContextCompactor {
  constructor(
    private settings: VerbexSettings,
    private countTokens: TokenCounter = tokenCount,
    private keepRecent: number = DEFAULT_KEEP_RECENT,
    private maxContextTokensOverride?: number,
  ) {}

  setSettings(settings: VerbexSettings): void {
    this.settings = settings
  }

  private get maxContextTokens(): number {
    return (
      this.maxContextTokensOverride ??
      this.settings.verbex.context.maxContextTokens
    )
  }

  async estimateTokens(messages: CompactableMessage[]): Promise<number> {
    const counts = await Promise.all(
      messages.map((message) =>
        this.countTokens(
          [
            message.content ?? '',
            message.tool_calls ? JSON.stringify(message.tool_calls) : '',
            message.tool_call ? JSON.stringify(message.tool_call) : '',
            message.responsesReplay
              ? JSON.stringify(message.responsesReplay)
              : '',
          ].join('\n'),
        ),
      ),
    )
    return counts.reduce((total, count) => total + count, 0)
  }

  async decide(messages: CompactableMessage[]): Promise<CompactionDecision> {
    const estimatedTokens = await this.estimateTokens(messages)
    const thresholdTokens = Math.floor(
      this.maxContextTokens * COMPACT_TRIGGER_RATIO,
    )
    return {
      estimatedTokens,
      thresholdTokens,
      ratio:
        this.maxContextTokens > 0 ? estimatedTokens / this.maxContextTokens : 0,
      shouldCompact:
        this.maxContextTokens > 0 && estimatedTokens >= thresholdTokens,
    }
  }

  /**
   * Summarize older conversational turns into a single assistant message,
   * keeping system messages and the most recent turns intact. Already-summary
   * messages are preserved. Returns the original list unchanged when there is
   * nothing worth compacting.
   */
  async compact<T extends CompactableMessage>(
    messages: T[],
    summarize: Summarizer,
  ): Promise<CompactionResult<T>> {
    const systemMessages = messages.filter((m) => m.role === 'system')
    const conversational = messages.filter((m) => m.role !== 'system')

    // Keep the tail verbatim; only fold non-summary messages older than that.
    // If the tail would start with one or more tool messages, pull the matching
    // assistant tool-call turn into the recent set too. Provider APIs expect tool
    // responses to stay adjacent to their assistant tool calls.
    let recentStart = Math.max(0, conversational.length - this.keepRecent)
    recentStart = Math.min(recentStart, protectedResponsesStart(conversational))
    while (recentStart > 0 && conversational[recentStart]?.role === 'tool') {
      recentStart -= 1
    }
    const older = conversational.slice(0, recentStart)
    const recent = conversational.slice(recentStart)
    const pinnedIndex = findPinnedTaskIndex(conversational)
    const pinned =
      pinnedIndex >= 0 && pinnedIndex < recentStart
        ? conversational[pinnedIndex]
        : null
    const preservedSummaries = older.filter(isCompactedMessage)
    const foldable = older.filter(
      (message, index) => !isCompactedMessage(message) && index !== pinnedIndex,
    )

    if (foldable.length === 0) {
      return { messages, summary: null, compactedCount: 0 }
    }

    const transcript = foldable
      .map(
        (m) =>
          `${m.role}: ${m.privateTranscript ? PRIVATE_TOOL_TEXT() : m.content}`,
      )
      .join('\n\n')
    const newDisclosure = compactedDisclosure(foldable)
    const newSummary = newDisclosure
      ? await summarize(transcript, newDisclosure)
      : await summarize(transcript)
    let summary = newSummary
    let summaryDisclosure = newDisclosure
    let summariesToKeep = preservedSummaries
    const preservedTokens = await Promise.all(
      preservedSummaries.map((message) => this.countTokens(message.content)),
    )
    const totalPreservedTokens = preservedTokens.reduce(
      (total, tokens) => total + tokens,
      0,
    )
    const mergeTriggerTokens = Math.max(
      SUMMARY_MERGE_FLOOR_TOKENS,
      Math.floor(this.maxContextTokens * SUMMARY_MERGE_TRIGGER_RATIO),
    )
    if (totalPreservedTokens >= mergeTriggerTokens) {
      try {
        const mergeInput = [
          ...preservedSummaries.map((message) => message.content),
          newSummary,
        ].join('\n\n')
        const mergedDisclosure = compactedDisclosure([
          ...preservedSummaries,
          { role: 'assistant', content: newSummary, disclosure: newDisclosure },
        ])
        const merged = mergedDisclosure
          ? await summarize(mergeInput, mergedDisclosure)
          : await summarize(mergeInput)
        const mergedTokens = await this.countTokens(merged.trim())
        const minimumMergedTokens = Math.max(
          MIN_MERGED_SUMMARY_FLOOR_TOKENS,
          Math.floor(
            (await this.countTokens(mergeInput)) * MIN_MERGED_SUMMARY_RATIO,
          ),
        )
        if (merged.trim() && mergedTokens >= minimumMergedTokens) {
          summary = merged.trim()
          summaryDisclosure = mergedDisclosure
          summariesToKeep = []
        }
      } catch (error) {
        // Keep prior summaries plus the new one: a failed merge must not become
        // a single irreversible loss point for long-running conversations.
        console.warn(
          '[Verbex] accumulated-summary merge failed; preserving originals',
          error,
        )
      }
    }

    const summaryMessage = {
      role: 'assistant',
      content: `${modelMarker('summary')}\n${summary}`,
      compacted: true,
      ...(summaryDisclosure ? { disclosure: summaryDisclosure } : {}),
    } as unknown as T

    return {
      messages: [
        ...systemMessages,
        ...summariesToKeep,
        summaryMessage,
        ...(pinned
          ? [
              {
                ...pinned,
                // Old first turns can contain an entire ContextBuilder pack.
                // Pin the actual instruction, not the bulky grounding wrapper.
                content: extractUserRequest(pinned.content),
              } as T,
            ]
          : []),
        ...recent,
      ],
      summary,
      compactedCount: foldable.length,
    }
  }

  /**
   * Compact only when the budget threshold is reached. Returns the decision
   * alongside the (possibly unchanged) messages.
   */
  async compactIfNeeded<T extends CompactableMessage>(
    messages: T[],
    summarize: Summarizer,
  ): Promise<CompactionResult<T> & { decision: CompactionDecision }> {
    const decision = await this.decide(messages)
    if (!decision.shouldCompact) {
      return { messages, summary: null, compactedCount: 0, decision }
    }
    const result = await this.compact(messages, summarize)
    return { ...result, decision }
  }
}

export function isCompactedMessage(message: CompactableMessage): boolean {
  return (
    message.compacted === true ||
    (typeof message.content === 'string' &&
      hasModelMarker(message.content, 'summary'))
  )
}
