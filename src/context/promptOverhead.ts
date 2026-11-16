import { RequestMessage } from '../types/llm/request'
import { estimateTokens } from '../utils/llm/estimateTokens'
import { tokenCount } from '../utils/llm/token'

/**
 * Estimates the serialized message envelope used by request preflight.
 * Tool schemas are intentionally excluded because the coordinator reserves
 * them separately when deriving messageInputBudget.
 */
export function estimateRequestMessageTokens(
  messages: readonly RequestMessage[],
): number {
  return messages.reduce(
    (sum, message) => sum + estimateTokens(JSON.stringify(message)),
    0,
  )
}

/**
 * Measures the same serialized envelope with the exact async tokenizer used
 * by the final request preflight. This avoids rejecting a request solely
 * because the intentionally conservative synchronous CJK estimate is larger
 * than the physical input budget.
 */
export async function measureStaticPromptOverhead(
  systemPrompt: string,
  priorHistory: readonly RequestMessage[],
  countTokens: (text: string) => Promise<number> = tokenCount,
): Promise<number> {
  const messages: RequestMessage[] = [
    { role: 'system', content: systemPrompt },
    ...priorHistory,
  ]
  const counts = await Promise.all(
    messages.map((message) => countTokens(JSON.stringify(message))),
  )
  return counts.reduce((sum, count) => sum + count, 0)
}
