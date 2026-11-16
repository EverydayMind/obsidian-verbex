import { L } from '../../i18n/modelText'
import { RequestMessage } from '../../types/llm/request'
import { ToolCallRequest } from '../../types/tool-call.types'

import type { AgentLoopResult } from './agentLoop'
import type { ChatStepResult } from './chatStep'
import { ResponsesProtocolError } from './responsesErrors'
import { newAgentTurnId } from './responsesReplay'

export function beginAgentTranscript(
  initialMessages: RequestMessage[],
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
      agentTurnId: newAgentTurnId(),
    }
  else if (messages.length)
    messages[0] = { ...messages[0], agentTurnId: newAgentTurnId() }
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
