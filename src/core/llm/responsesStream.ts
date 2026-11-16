import { LLMOptions } from '../../types/llm/request'
import { LLMResponseStreaming } from '../../types/llm/response'
import {
  ResponsesOutputItem,
  ResponsesScope,
  ResponsesWireResponse,
} from '../../types/llm/responses'
import {
  RequestTimeoutError,
  StreamSource,
} from '../../utils/llm/httpTransport'
import { parseJsonSseStream } from '../../utils/llm/sse'

import { ResponsesProtocolError } from './responsesErrors'
import {
  RESPONSES_MESSAGE_SEPARATOR,
  normalizeResponsesResponse,
  responsesFailure,
} from './responsesResponse'

type ResponsesEvent = {
  type: string
  response?: ResponsesWireResponse
  item?: ResponsesOutputItem
  output_index?: number
  item_id?: string
  delta?: string
  arguments?: string
  code?: string
}

/** Function calls become executable only after a successful terminal event. */
export async function* decodeResponsesStream(
  stream: StreamSource,
  scope: ResponsesScope,
  options?: LLMOptions,
): AsyncIterable<LLMResponseStreaming> {
  const controller = new AbortController()
  const abort = () => controller.abort(options?.signal?.reason)
  options?.signal?.addEventListener('abort', abort, { once: true })
  if (options?.signal?.aborted) abort()
  const timeoutMs = options?.timeoutMs ?? 120_000
  const timer = setTimeout(
    () => controller.abort(new RequestTimeoutError(timeoutMs)),
    timeoutMs,
  )
  let text = ''
  let textItemKey: string | number | undefined
  let id = ''
  let model = ''
  const calls = new Map<number, { id: string; arguments: string }>()
  const completedItems = new Map<number, ResponsesOutputItem>()
  const chunk = (
    delta: LLMResponseStreaming['choices'][number]['delta'],
    finish_reason: string | null = null,
  ): LLMResponseStreaming => ({
    id,
    model,
    object: 'chat.completion.chunk',
    choices: [{ delta, finish_reason }],
  })
  try {
    for await (const event of parseJsonSseStream<ResponsesEvent>(
      stream,
      controller.signal,
    )) {
      if (!event || typeof event.type !== 'string')
        throw new ResponsesProtocolError(
          'Responses SSE event has no type.',
          text,
        )
      if (event.response) {
        id = event.response.id
        model = event.response.model
      }
      switch (event.type) {
        case 'response.output_text.delta':
        case 'response.refusal.delta': {
          if (typeof event.delta !== 'string')
            throw new ResponsesProtocolError(
              'Invalid Responses text delta.',
              text,
            )
          if (event.delta === '') break
          // Mirror responsesText: a new message Item starts a new paragraph.
          const itemKey = event.item_id ?? event.output_index
          const content =
            text !== '' && itemKey !== textItemKey
              ? `${RESPONSES_MESSAGE_SEPARATOR}${event.delta}`
              : event.delta
          textItemKey = itemKey
          text += content
          yield chunk({ content })
          break
        }
        case 'response.output_item.added':
          if (event.item?.type === 'function_call') {
            if (event.output_index === undefined || !event.item.id)
              throw new ResponsesProtocolError(
                'Invalid Responses function Item.',
              )
            if (calls.has(event.output_index))
              throw new ResponsesProtocolError(
                'Duplicate Responses function Item index.',
              )
            calls.set(event.output_index, {
              id: event.item.id,
              arguments: event.item.arguments ?? '',
            })
            // Hide intermediate prose immediately, without exposing partial arguments.
            yield chunk({ tool_calls: [{ index: event.output_index }] })
          }
          break
        case 'response.function_call_arguments.delta': {
          const call =
            event.output_index === undefined
              ? undefined
              : calls.get(event.output_index)
          if (
            !call ||
            call.id !== event.item_id ||
            typeof event.delta !== 'string'
          )
            throw new ResponsesProtocolError(
              'Responses argument delta has no matching function Item.',
            )
          call.arguments += event.delta
          break
        }
        case 'response.function_call_arguments.done': {
          const call =
            event.output_index === undefined
              ? undefined
              : calls.get(event.output_index)
          if (
            !call ||
            call.id !== event.item_id ||
            typeof event.arguments !== 'string'
          )
            throw new ResponsesProtocolError(
              'Invalid Responses completed arguments.',
            )
          // done is authoritative, not another delta to append.
          call.arguments = event.arguments
          break
        }
        case 'response.output_item.done':
          if (event.item && event.output_index !== undefined) {
            completedItems.set(event.output_index, event.item)
            const call = calls.get(event.output_index)
            if (call && event.item.type === 'function_call') {
              if (event.item.id !== call.id)
                throw new ResponsesProtocolError(
                  'Responses completed function Item identity mismatch.',
                )
              call.arguments = event.item.arguments
            }
          }
          break
        case 'response.failed':
        case 'error':
          throw responsesFailure(event.response?.error?.code ?? event.code)
        case 'response.completed':
        case 'response.incomplete': {
          if (!event.response)
            throw new ResponsesProtocolError(
              'Responses terminal event has no response.',
              text,
            )
          if (
            (event.type === 'response.completed') !==
            (event.response.status === 'completed')
          )
            throw new ResponsesProtocolError(
              'Responses terminal status mismatch.',
              text,
            )
          // The terminal output is the source of truth for both protocols.
          const response = await normalizeResponsesResponse(
            event.response,
            scope,
          )
          const choice = response.choices[0]
          const finalText = choice.message.content ?? ''
          if (!finalText.startsWith(text))
            throw new ResponsesProtocolError(
              'Responses terminal text differs from streamed text.',
              text,
            )
          const toolCalls = choice.message.tool_calls ?? []
          const terminalOutput = event.response.output
          // Match delta Item identity to final Item identity; never invent call IDs.
          if (event.response.status === 'completed') {
            for (const [index, call] of calls) {
              const item = event.response.output[index]
              if (
                item?.type !== 'function_call' ||
                item.id !== call.id ||
                item.arguments !== call.arguments
              )
                throw new ResponsesProtocolError(
                  'Responses terminal function Item differs from streamed arguments.',
                  text,
                )
            }
            for (const [index, item] of completedItems) {
              if (event.response.output[index]?.id !== item.id)
                throw new ResponsesProtocolError(
                  'Responses terminal Item identity mismatch.',
                  text,
                )
            }
          }
          yield {
            ...chunk(
              {
                content: finalText.slice(text.length),
                ...(toolCalls.length
                  ? {
                      tool_calls: toolCalls.map((call) => ({
                        ...call,
                        index: terminalOutput.findIndex(
                          (item) =>
                            item.type === 'function_call' &&
                            item.call_id === call.id,
                        ),
                      })),
                    }
                  : {}),
                ...(choice.message.responsesReplay
                  ? { responsesReplay: choice.message.responsesReplay }
                  : {}),
              },
              choice.finish_reason,
            ),
            usage: response.usage,
          }
          return
        }
        default:
          // Ignore hidden reasoning and unknown future event types.
          break
      }
    }
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ResponsesProtocolError('Malformed Responses SSE event.', text)
    throw error
  } finally {
    clearTimeout(timer)
    options?.signal?.removeEventListener('abort', abort)
  }
  throw new ResponsesProtocolError(
    'Responses stream ended without a terminal event.',
    text,
  )
}
