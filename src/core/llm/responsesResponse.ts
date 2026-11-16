import { LLMResponseNonStreaming, ToolCall } from '../../types/llm/response'
import {
  ResponsesOutputItem,
  ResponsesScope,
  ResponsesWireResponse,
} from '../../types/llm/responses'
import { HttpRequestError } from '../../utils/llm/httpTransport'

import { ResponsesProtocolError } from './responsesErrors'
import { makeResponsesReplay } from './responsesReplay'

export function responsesFailure(code?: string): Error {
  // Do not copy provider error bodies, which can contain prompt/argument data.
  if (code === 'server_error' || code === 'internal_error')
    return new HttpRequestError(500, 'Responses server error')
  if (code === 'rate_limit_exceeded')
    return new HttpRequestError(429, 'Responses rate limit exceeded')
  return new ResponsesProtocolError(
    `Responses request failed (${code ?? 'unknown error'}).`,
  )
}

/** Separates assistant message Items (e.g. a preamble and the final answer). */
export const RESPONSES_MESSAGE_SEPARATOR = '\n\n'

export function responsesText(items: ResponsesOutputItem[]): string {
  return items
    .filter((item) => item.type === 'message')
    .map((item) =>
      item.content
        .map((part) => (part.type === 'output_text' ? part.text : part.refusal))
        .join(''),
    )
    .filter((text) => text !== '')
    .join(RESPONSES_MESSAGE_SEPARATOR)
}

function validateOutput(items: ResponsesOutputItem[]): void {
  const itemIds = new Set<string>()
  for (const item of items) {
    if (
      !item ||
      !['message', 'function_call', 'reasoning'].includes(item.type) ||
      typeof item.id !== 'string' ||
      !item.id ||
      itemIds.has(item.id)
    )
      throw new ResponsesProtocolError(
        'Invalid or unsupported Responses output Item.',
      )
    itemIds.add(item.id)
    if (
      item.type === 'message' &&
      (item.role !== 'assistant' ||
        !Array.isArray(item.content) ||
        item.content.some(
          (part) =>
            !part ||
            (part.type === 'output_text'
              ? typeof part.text !== 'string'
              : part.type !== 'refusal' || typeof part.refusal !== 'string'),
        ))
    )
      throw new ResponsesProtocolError('Invalid Responses assistant message.')
    if (
      item.type === 'reasoning' &&
      (!Array.isArray(item.summary) ||
        (item.encrypted_content != null &&
          typeof item.encrypted_content !== 'string'))
    )
      throw new ResponsesProtocolError('Invalid Responses reasoning Item.')
  }
}

export async function normalizeResponsesResponse(
  response: ResponsesWireResponse,
  scope: ResponsesScope,
): Promise<LLMResponseNonStreaming> {
  if (!response || !Array.isArray(response.output))
    throw new ResponsesProtocolError('Invalid Responses output.')
  if (response.status === 'failed' || response.error)
    throw responsesFailure(response.error?.code)
  validateOutput(response.output)
  const text = responsesText(response.output)
  let finishReason: string
  if (response.status === 'completed') finishReason = 'stop'
  else if (
    response.status === 'incomplete' &&
    response.incomplete_details?.reason === 'max_output_tokens'
  )
    finishReason = 'length'
  else if (
    response.status === 'incomplete' &&
    response.incomplete_details?.reason === 'content_filter'
  )
    finishReason = 'content_filter'
  else
    throw new ResponsesProtocolError(
      `Responses did not complete (${response.incomplete_details?.reason ?? response.status}).`,
      text,
    )

  const calls: ToolCall[] = []
  const ids = new Set<string>()
  if (response.status === 'completed') {
    for (const item of response.output) {
      if (!['message', 'function_call', 'reasoning'].includes(item.type))
        throw new ResponsesProtocolError(
          'Unsupported Responses output Item; hosted tools are not enabled.',
        )
      if (item.status && item.status !== 'completed')
        throw new ResponsesProtocolError(
          'Completed response contains an unfinished Item.',
          text,
        )
      if (item.type !== 'function_call') continue
      if (
        !item.id ||
        !item.call_id ||
        !item.name ||
        typeof item.arguments !== 'string' ||
        ids.has(item.call_id)
      )
        throw new ResponsesProtocolError(
          'Invalid Responses function call identifiers.',
          text,
        )
      ids.add(item.call_id)
      try {
        const args: unknown = JSON.parse(item.arguments)
        if (!args || typeof args !== 'object' || Array.isArray(args))
          throw new Error('Object required')
      } catch {
        throw new ResponsesProtocolError(
          'Responses function arguments are incomplete or invalid.',
          text,
        )
      }
      calls.push({
        id: item.call_id,
        type: 'function',
        function: { name: item.name, arguments: item.arguments },
      })
    }
    if (calls.length) finishReason = 'tool_calls'
  }
  return {
    id: response.id,
    model: response.model,
    created: response.created_at,
    object: 'chat.completion',
    choices: [
      {
        finish_reason: finishReason,
        message: {
          role: 'assistant',
          content: text,
          ...(calls.length ? { tool_calls: calls } : {}),
          ...(response.status === 'completed'
            ? {
                responsesReplay: await makeResponsesReplay(
                  scope,
                  response.output,
                ),
              }
            : {}),
        },
      },
    ],
    ...(response.usage
      ? {
          usage: {
            prompt_tokens: response.usage.input_tokens,
            completion_tokens: response.usage.output_tokens,
            total_tokens: response.usage.total_tokens,
            prompt_tokens_details: response.usage.input_tokens_details,
            completion_tokens_details: response.usage.output_tokens_details,
          },
        }
      : {}),
  }
}
