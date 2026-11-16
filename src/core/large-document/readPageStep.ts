import { type ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import { RequestMessage } from '../../types/llm/request'
import { tokenCount } from '../../utils/llm/token'
import { GatedChatStepInput, gatedChatStep } from '../llm/budgetGate'
import { AgentToolOutcome } from '../llm/toolOutcome'

export type DigestUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  completion_calls: number
  estimated: boolean
}
export type DigestInput = Pick<
  GatedChatStepInput,
  'settings' | 'inputBudget' | 'options' | 'disclosureContext'
>

export const digestTrimMarker = (locale?: ModelLocale): string =>
  L(
    {
      ko: '\n[… 구간 요약이 예산을 넘어 뒷부분 생략]',
      en: '\n[… page digest exceeded the budget; remainder omitted]',
    },
    locale,
  )

/** Models cannot count tokens, so the prompt states the size in characters. */
export const digestSizeHint = (retainedTokens: number): string =>
  L({
    ko: `한국어 기준 약 ${Math.floor((retainedTokens * 0.7) / 50) * 50}자 이내`,
    en: `about ${Math.floor((retainedTokens * 0.7) / 50) * 50} characters or fewer`,
  })

async function trimToTokens(text: string, maxTokens: number): Promise<string> {
  const marker = digestTrimMarker()
  if ((await tokenCount(text)) <= maxTokens) return text
  let low = 0
  let high = text.length
  while (low < high) {
    const kept = Math.ceil((low + high) / 2)
    if ((await tokenCount(text.slice(0, kept) + marker)) <= maxTokens)
      low = kept
    else high = kept - 1
  }
  return text.slice(0, low) + marker
}

/**
 * One isolated digest call per chunk. A Responses turn cannot shrink a tool
 * result after it is sent, so the retained size is guaranteed here: more output
 * room after a length stop, one compression pass, then a marked mechanical trim.
 */
export function createReadPageStep(
  input: DigestInput,
  outcome: AgentToolOutcome,
  usage: DigestUsage,
  retainedTokens: number,
) {
  const call = { id: 'read-page', name: 'read_page', arguments: '{}' }
  const envelope = (content: string): RequestMessage[] => [
    { role: 'assistant', content: '', tool_calls: [call] },
    { role: 'tool', tool_call: call, content, disclosure: outcome.disclosure },
  ]
  // Output reserve includes reasoning, so it is far larger than the digest.
  const outputRoom = (large: boolean) =>
    Math.min(
      large ? 8192 : 4096,
      Math.max(1024, Math.floor((input.inputBudget ?? 8000) / (large ? 2 : 3))),
    )
  const run = async (blocks: RequestMessage[], large: boolean) => {
    input.options?.signal?.throwIfAborted()
    const step = await gatedChatStep({
      ...input,
      requiredBlocks: blocks,
      maxTokens: outputRoom(large),
    })
    usage.prompt_tokens += step.usage.prompt_tokens
    usage.completion_tokens += step.usage.completion_tokens
    usage.total_tokens += step.usage.total_tokens
    usage.completion_calls += 1
    usage.estimated ||= step.usageEstimated
    const tokens = await tokenCount(step.text)
    console.debug(
      '[Verbex][read-page-digest]',
      JSON.stringify({
        finishReason: step.finishReason,
        tokens,
        retainedTokens,
      }),
    )
    return { text: step.text, finishReason: step.finishReason, tokens }
  }
  return async (messages: RequestMessage[]) => {
    const blocks = messages.flatMap((message): RequestMessage[] =>
      message.role === 'user'
        ? envelope(
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content),
          )
        : [message],
    )
    let digest = await run(blocks, false)
    if (digest.finishReason === 'length') digest = await run(blocks, true)
    // Still cut off: report it so the caller marks this page as not digested.
    if (digest.finishReason === 'length') return digest
    if (digest.tokens > retainedTokens) {
      const compact = await run(
        [
          {
            role: 'system',
            content: L({
              ko: `다음 구간 요약을 ${digestSizeHint(retainedTokens)}의 짧은 핵심 bullet로 압축하세요. 수치·주요 논점·한계를 보존하고 서론·결론·추가 안내는 생략하세요.`,
              en: `Compress the following page digest into brief key bullets of ${digestSizeHint(retainedTokens)}. Preserve figures, key points, and limitations; omit introductions, conclusions, and additional guidance.`,
            }),
          },
          ...envelope(digest.text),
        ],
        true,
      )
      if (
        compact.finishReason !== 'length' &&
        compact.text.trim() &&
        compact.tokens < digest.tokens
      )
        digest = compact
    }
    return {
      text: await trimToTokens(digest.text, retainedTokens),
      finishReason: digest.finishReason,
    }
  }
}
