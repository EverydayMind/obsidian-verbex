import { verbexBuildRequestTag } from '../../buildInfo'
import { LLMRequestBase, RequestMessage } from '../../types/llm/request'
import { ResponsesScope } from '../../types/llm/responses'

import { ResponsesProtocolError } from './responsesErrors'
import { assertResponsesReplay } from './responsesReplay'

async function inputItems(
  messages: RequestMessage[],
  scope: ResponsesScope,
): Promise<unknown[]> {
  const items: unknown[] = []
  const pending = new Set<string>()
  const seen = new Set<string>()
  const registerCall = (id: string) => {
    if (!id || seen.has(id))
      throw new ResponsesProtocolError(
        'Missing or duplicate Responses function call_id.',
      )
    seen.add(id)
    pending.add(id)
  }
  for (const message of messages) {
    if (message.role === 'assistant' && message.responsesReplay) {
      if (pending.size)
        throw new ResponsesProtocolError(
          'Responses continuation has unresolved function calls before the next response.',
        )
      await assertResponsesReplay(message.responsesReplay, scope)
      for (const item of message.responsesReplay.items) {
        if (item.type === 'function_call') registerCall(item.call_id)
        items.push(item)
      }
      continue
    }
    if (message.role === 'tool') {
      if (!pending.delete(message.tool_call.id))
        throw new ResponsesProtocolError(
          'Responses tool output has no matching function call.',
        )
      items.push({
        type: 'function_call_output',
        call_id: message.tool_call.id,
        output: message.content,
      })
      continue
    }
    if (pending.size)
      throw new ResponsesProtocolError(
        'Responses function calls must receive their outputs before the next message.',
      )
    if (message.role === 'user') {
      const parts =
        typeof message.content === 'string'
          ? [{ type: 'text' as const, text: message.content }]
          : message.content
      items.push({
        role: 'user',
        content: parts.map((part) =>
          part.type === 'text'
            ? { type: 'input_text', text: part.text }
            : { type: 'input_image', image_url: part.image_url.url },
        ),
      })
    } else {
      if (message.content)
        items.push({ role: message.role, content: message.content })
      if (message.role === 'assistant') {
        for (const call of message.tool_calls ?? []) {
          registerCall(call.id)
          items.push({
            type: 'function_call',
            call_id: call.id,
            name: call.name,
            arguments: call.arguments ?? '{}',
          })
        }
      }
    }
  }
  if (pending.size)
    throw new ResponsesProtocolError(
      'Responses continuation has unresolved function calls.',
    )
  return items
}

export async function buildResponsesRequest(
  request: LLMRequestBase,
  stream: boolean,
  scope: ResponsesScope,
): Promise<Record<string, unknown>> {
  const format = request.response_format
  const textFormat =
    format?.type === 'json_schema'
      ? {
          type: 'json_schema',
          ...format.json_schema,
          strict: format.json_schema.strict ?? false,
        }
      : format
  return {
    model: request.model,
    store: false,
    truncation: 'disabled',
    // Compatibility option for servers that do not include encrypted Items by default.
    include: ['reasoning.encrypted_content'],
    metadata: { verbex_build: verbexBuildRequestTag() },
    input: await inputItems(request.messages, scope),
    ...(stream ? { stream: true } : {}),
    ...(request.tools
      ? {
          tools: request.tools.map((tool) => ({
            type: 'function',
            ...tool.function,
            strict: false,
          })),
        }
      : {}),
    ...(request.tool_choice
      ? {
          tool_choice:
            typeof request.tool_choice === 'string'
              ? request.tool_choice
              : { type: 'function', name: request.tool_choice.function.name },
        }
      : {}),
    ...(textFormat ? { text: { format: textFormat } } : {}),
    ...(request.reasoning_effort !== undefined
      ? { reasoning: { effort: request.reasoning_effort } }
      : {}),
    ...(request.max_tokens !== undefined
      ? { max_output_tokens: request.max_tokens }
      : {}),
    ...(request.temperature !== undefined
      ? { temperature: request.temperature }
      : {}),
    ...(request.top_p !== undefined ? { top_p: request.top_p } : {}),
  }
}
