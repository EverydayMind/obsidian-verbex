import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import { RequestMessage } from '../../types/llm/request'
import { ToolCallRequest } from '../../types/tool-call.types'
import { toolArgsValid } from '../tools/parseToolArgs'

import type { AgentLoopResult } from './agentLoop'
import type { ChatStepResult } from './chatStep'
import { ResponsesProtocolError } from './responsesErrors'
import { newAgentTurnId } from './responsesReplay'
import type { AgentToolOutcome } from './toolOutcome'

export function beginAgentTranscript(
  initialMessages: RequestMessage[],
  turnId?: string,
): RequestMessage[] {
  const messages = [...initialMessages]
  for (let index = 0; index < messages.length; index++) {
    const { agentTurnId: _oldTurn, ...rest } = messages[index]
    messages[index] = rest
  }
  const lastUser = messages.map((message) => message.role).lastIndexOf('user')
  if (lastUser >= 0)
    messages[lastUser] = {
      ...messages[lastUser],
      agentTurnId: turnId ?? newAgentTurnId(),
    }
  else if (messages.length)
    messages[0] = { ...messages[0], agentTurnId: turnId ?? newAgentTurnId() }
  return messages
}

export function assistantProtocolMessage(
  result: ChatStepResult,
  calls: ToolCallRequest[] = [],
): RequestMessage {
  return {
    role: 'assistant',
    content: result.text,
    ...(calls.length
      ? {
          tool_calls: result.responsesReplay
            ? calls.map((call) => ({ ...call }))
            : calls,
        }
      : {}),
    ...(result.responsesReplay
      ? { responsesReplay: result.responsesReplay }
      : {}),
  }
}

export function recordUnexecutedCalls(
  messages: RequestMessage[],
  result: ChatStepResult,
): void {
  if (!result.responsesReplay) {
    messages.push({ role: 'assistant', content: result.text })
    return
  }
  const calls = result.toolCalls.map((call) => {
    if (!call.id)
      throw new ResponsesProtocolError(
        'Responses function call has no call_id.',
      )
    return {
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    }
  })
  messages.push(assistantProtocolMessage(result, calls))
  for (const call of calls)
    messages.push({
      role: 'tool',
      tool_call: call,
      content:
        'This call was not executed because it did not satisfy the active tool directive. No tool effects occurred.',
    })
}

export function mergeDirectedArguments(
  calls: ToolCallRequest[],
  required: Record<string, string | number | boolean | null>,
): void {
  for (const call of calls) {
    let args: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(call.arguments ?? '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        args = parsed as Record<string, unknown>
    } catch {
      /* Rebuild malformed arguments from the host directive. */
    }
    // A host-bound review source replaces the model's alternative source.
    // Merging the two independently can manufacture an invalid mixed input.
    if (['build_review_index', 'build_treaty_wiki'].includes(call.name)) {
      if (required.source_path && !required.source_folder)
        delete args.source_folder
      if (required.source_folder && !required.source_path)
        delete args.source_path
    }
    call.arguments = JSON.stringify({ ...args, ...required })
  }
}

export function withInvalidArgsFact(
  call: ToolCallRequest,
  outcome: AgentToolOutcome,
): AgentToolOutcome {
  const args = call.arguments ?? ''
  if (outcome.status !== 'failed' || toolArgsValid(args)) return outcome
  return {
    ...outcome,
    displayText: L({
      ko: `${outcome.displayText}\n${modelMarker('harnessFact', 'ko')} 받은 인자가 올바른 JSON 객체가 아니어서(${args.length}자, 끝: "${args.slice(-40)}") 빈 인자로 실행했다. 내용이 길면 나눠서 다시 호출하라.`,
      en: `${outcome.displayText}\n${modelMarker('harnessFact', 'en')} The received arguments were not a valid JSON object (${args.length} characters, tail: "${args.slice(-40)}"), so the tool ran with empty arguments. Split long content across calls.`,
    }),
  }
}

export function seedChatStepResult(seed: ToolCallRequest[]): ChatStepResult {
  return {
    modelId: '',
    text: '',
    reasoning: null,
    finishReason: 'tool_calls',
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    usageEstimated: false,
    warnings: [],
    toolCalls: seed.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    })),
  }
}

export function incompleteAgentResult(
  result: ChatStepResult,
  messages: RequestMessage[],
  calls: ToolCallRequest[],
  iteration: number,
  evidence: AgentLoopResult['evidence'],
): Omit<AgentLoopResult, 'mutations'> | undefined {
  if (
    !result.finishReason ||
    ['stop', 'tool_calls', 'function_call'].includes(result.finishReason)
  )
    return undefined
  return {
    messages,
    toolCalls: calls,
    iterations: iteration,
    evidence,
    finalText:
      result.finishReason === 'length'
        ? [
            result.text,
            L({
              ko: '출력 토큰 한도에서 응답이 잘렸습니다.',
              en: 'The response was truncated at the output token limit.',
            }),
          ]
            .filter(Boolean)
            .join('\n\n')
        : result.text || `Provider response ended with ${result.finishReason}.`,
    stoppedReason:
      result.finishReason === 'degenerate_repetition'
        ? 'degenerate_repetition'
        : 'failed',
  }
}
