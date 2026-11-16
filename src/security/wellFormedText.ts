import type { RequestMessage } from '../types/llm/request'

function wellFormed(value: string): string {
  const native = value as string & { toWellFormed?: () => string }
  if (native.toWellFormed) return native.toWellFormed()
  return value.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '\uFFFD',
  )
}

/** Operates only on the private snapshot, preserving protocol metadata. */
export function normalizeMessageText(message: RequestMessage): void {
  if (typeof message.content === 'string')
    message.content = wellFormed(message.content)
  else
    for (const part of message.content) {
      if (part.type === 'text') part.text = wellFormed(part.text)
    }
  if (message.role === 'assistant') {
    for (const call of message.tool_calls ?? []) {
      if (call.arguments !== undefined)
        call.arguments = wellFormed(call.arguments)
    }
  }
}
