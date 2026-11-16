import { gatedChatStep } from '../core/llm/budgetGate'
import { L } from '../i18n/modelText'
import type { DisclosureContext } from '../security/promptInjectionBoundary'
import type { VerbexSettings } from '../settings/schema/setting.types'
import type { ConnectorDisclosure } from '../types/llm/request'
import {
  InlineWritingInput,
  buildInlineMessages,
  sanitizeInlineOutput,
} from '../utils/chat/inlineWriting'

import {
  EvictionCandidate,
  parseEvictionRefs,
  relevanceDisclosure,
  relevanceManifest,
} from './relevanceEviction'
import { relevanceSystemPrompt } from './relevanceSystemPrompt'

// Short single-purpose model calls used beside the agent loop. They own no
// state; callers pass the settings snapshot and the cancellation signal.

export async function generateInlineCompletion(
  settings: VerbexSettings,
  input: InlineWritingInput & { signal?: AbortSignal },
): Promise<{ text: string; warnings: string[] }> {
  const result = await gatedChatStep({
    settings,
    alias: 'default',
    requiredBlocks: buildInlineMessages(input),
    temperature: input.mode === 'continue' ? 0.6 : 0.3,
    ...(input.signal ? { options: { signal: input.signal } } : {}),
  })
  return {
    text: sanitizeInlineOutput(result.text, {
      preserveLeading: input.mode === 'continue',
    }),
    warnings: result.warnings,
  }
}

export async function summarizeAgentTranscript(
  settings: VerbexSettings,
  transcript: string,
  signal?: AbortSignal,
  disclosure?: ConnectorDisclosure,
  disclosureContext?: DisclosureContext,
): Promise<string> {
  const summary = await gatedChatStep({
    settings,
    requiredBlocks: [
      {
        role: 'system',
        content:
          'You summarize prior Verbex agent work for a smaller-context model. Preserve the user original instruction, target file paths, current progress, files read or changed, tool results, approvals/rejections, unresolved questions, and next actions. Quote the original instruction and target paths verbatim. Be concise and factual.',
      },
      {
        role: 'user',
        content: L({
          ko: `Summarize this prior agent transcript in Korean unless file names or quoted text require the original language:\n\n${transcript}`,
          en: `Summarize this prior agent transcript in English unless file names or quoted text require the original language:\n\n${transcript}`,
        }),
        ...(disclosure ? { disclosure } : {}),
      },
    ],
    alias: 'fast',
    retry: { numOfAttempts: 1 },
    ...(disclosureContext ? { disclosureContext } : {}),
    ...(signal ? { options: { signal } } : {}),
  })
  const text = summary.text.trim()
  if (!text) throw new Error('Empty agent transcript summary')
  return text
}

/**
 * Ask the model which previously-read files are no longer relevant to the
 * goal, so their bodies can be evicted from the transcript. Conservative by
 * instruction (keep anything possibly useful) and by parsing (an unparseable
 * reply evicts nothing). Uses the fast alias since it is a short triage call.
 */
export async function judgeIrrelevantReads(
  settings: VerbexSettings,
  input: {
    goal: string
    candidates: EvictionCandidate[]
  },
  signal?: AbortSignal,
  disclosureContext?: DisclosureContext,
): Promise<string[]> {
  if (input.candidates.length === 0) {
    return []
  }
  const manifest = relevanceManifest(input.candidates)
  const disclosure = relevanceDisclosure(input.candidates)
  const result = await gatedChatStep({
    settings,
    alias: 'fast',
    // Deterministic triage uses an object envelope for Structured Outputs.
    reasoningEffort: 'none',
    temperature: 0,
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'eviction_refs',
        schema: {
          type: 'object',
          properties: { refs: { type: 'array', items: { type: 'string' } } },
          required: ['refs'],
          additionalProperties: false,
        },
      },
    },
    retry: { numOfAttempts: 1 },
    ...(disclosureContext ? { disclosureContext } : {}),
    ...(signal ? { options: { signal } } : {}),
    requiredBlocks: [
      {
        role: 'system',
        content: relevanceSystemPrompt(),
      },
      {
        role: 'user',
        content: L({
          ko: `작업 목표:\n${input.goal}\n\n현재 컨텍스트에 본문이 남아 있는, 이전에 읽은 파일 결과 목록입니다. 더 이상 필요 없는 번호를 JSON 객체로 반환하세요(예: {"refs":["3","7"]}).\n\n${manifest}`,
          en: `Goal:\n${input.goal}\n\nThese previously read file results still have their bodies in the current context. Return the numbers no longer needed in a JSON object (e.g. {"refs":["3","7"]}).\n\n${manifest}`,
        }),
        ...(disclosure ? { disclosure } : {}),
      },
    ],
  })
  return parseEvictionRefs(result.text)
}
