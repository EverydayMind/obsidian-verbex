import { attachProviderPageVersion } from '../../context/structuredReadObservation'
import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import type { RequestMessage } from '../../types/llm/request'
import type { ToolCallRequest } from '../../types/tool-call.types'

import type { AgentToolOutcome } from './toolOutcome'

export const PRIVATE_TOOL_TEXT = (locale: ModelLocale = getModelLocale()) =>
  L(
    {
      ko: '[브라우저 원문과 입력 인자는 실행 중에만 사용하며 대화 기록에 저장하지 않습니다.]',
      en: '[Browser source text and input arguments are used only during execution and are not stored in conversation history.]',
    },
    locale,
  )

export function toolResultMessage(
  call: ToolCallRequest,
  outcome: AgentToolOutcome,
): RequestMessage {
  const message: RequestMessage = {
    role: 'tool',
    tool_call: call,
    content: outcome.displayText,
    ...(outcome.status === 'succeeded' &&
    (outcome.readFacts?.coverage?.mode === 'lines' ||
      outcome.readFacts?.coverage?.mode === 'notes')
      ? {
          queryReplay: {
            mode: outcome.readFacts.coverage.mode,
            cursor: outcome.readFacts.coverage.replayCursor,
            replayCall: `obsidian_query lines=${String(outcome.readFacts.coverage.mode === 'lines')}, cursor="${outcome.readFacts.coverage.replayCursor}"`,
          },
        }
      : {}),
    ...(outcome.repeatOriginalText !== undefined
      ? { repeatOriginalText: outcome.repeatOriginalText }
      : {}),
    ...(outcome.images?.length ? { images: outcome.images } : {}),
    ...(outcome.privateTranscript ? { privateTranscript: true } : {}),
    ...(outcome.disclosure ? { disclosure: outcome.disclosure } : {}),
  }
  attachProviderPageVersion(outcome, message)
  return message
}

export function publicToolCall(
  call: ToolCallRequest,
  outcome?: AgentToolOutcome,
): ToolCallRequest {
  if (outcome && !outcome.privateTranscript) return call
  return { id: call.id, name: call.name, arguments: '{}' }
}

/** Allowlist: provider text, errors, paths and arbitrary result extensions stay private. */
export function publicToolOutcome(outcome: AgentToolOutcome): AgentToolOutcome {
  if (!outcome.privateTranscript) {
    const { hostBlock: _hostBlock, ...safe } = outcome
    return safe
  }
  return {
    privateTranscript: true,
    status: outcome.status,
    terminal: outcome.terminal,
    mutation: outcome.mutation,
    mutationScope: outcome.mutationScope,
    mutationKey: outcome.mutationKey,
    retry: { allowed: outcome.retry?.allowed ?? false },
    displayText: `${PRIVATE_TOOL_TEXT()} (${outcome.status}, ${outcome.mutation})`,
  }
}

/** Scrub both halves of a tool exchange without changing the live model transcript. */
export function publicToolMessages(
  messages: RequestMessage[],
  isPrivateTool?: (name: string) => boolean,
): RequestMessage[] {
  const ids = privateToolCallIds(messages)
  for (const message of messages) {
    const calls =
      message.role === 'assistant'
        ? (message.tool_calls ?? [])
        : message.role === 'tool'
          ? [message.tool_call]
          : []
    calls.forEach((call) => {
      if (isPrivateTool?.(call.name)) ids.add(call.id)
    })
  }
  return messages.map((message) => {
    if (message.role === 'user' && message.toolImageSource)
      return { role: 'user', content: PRIVATE_TOOL_TEXT() }
    if (message.role === 'tool' && ids.has(message.tool_call.id))
      return {
        role: 'tool',
        tool_call: publicToolCall(message.tool_call),
        content: PRIVATE_TOOL_TEXT(),
      }
    if (message.role === 'assistant' && message.tool_calls)
      return {
        ...message,
        tool_calls: message.tool_calls.map((call) =>
          ids.has(call.id) ? publicToolCall(call) : call,
        ),
      }
    return message
  })
}

export function privateToolCallIds(messages: RequestMessage[]): Set<string> {
  return new Set(
    messages.flatMap((message) =>
      message.role === 'tool' && message.privateTranscript
        ? [message.tool_call.id]
        : [],
    ),
  )
}

/** Publish a callback copy; the executor's original remains available for this run. */
export function publishToolResult(
  notify:
    | ((call: ToolCallRequest, text: string, outcome: AgentToolOutcome) => void)
    | undefined,
  call: ToolCallRequest,
  outcome: AgentToolOutcome,
): void {
  const safe = publicToolOutcome(outcome)
  notify?.(
    outcome.privateTranscript ? publicToolCall(call) : call,
    safe.displayText,
    safe,
  )
}
