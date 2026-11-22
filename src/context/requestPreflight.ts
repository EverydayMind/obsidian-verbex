import { protectedResponsesStart } from '../core/llm/responsesReplay'
import {
  TOOL_IMAGE_TOKEN_RESERVE,
  toolImageTokenInput,
} from '../core/llm/toolImages'
import { L } from '../i18n/modelText'
import { RequestMessage } from '../types/llm/request'
import { tokenCount } from '../utils/llm/token'

import { findPinnedTaskIndex } from './taskPinning'

const SAFETY_MARGIN_TOKENS = 64
const MIN_TOOL_RESULT_TOKENS = 128
const TOOL_RESULT_BUDGET_RATIO = 0.15
const TRUNCATION_MARKER =
  '\n\n[... context preflight truncated this tool result ...]\n\n'

export class ContextBudgetExceededError extends Error {
  constructor(
    readonly estimatedTokens: number,
    readonly budgetTokens: number,
  ) {
    super(
      `The request still needs approximately ${estimatedTokens} input tokens after safe transcript reduction, but only ${budgetTokens} are available. Narrow the request or use bounded section reads.`,
    )
    this.name = 'ContextBudgetExceededError'
  }
}

export type RequestPreflightResult = {
  messages: RequestMessage[]
  estimatedTokens: number
  budgetTokens: number
  truncatedToolResults: number
  reducedOlderMessages: number
  removedToolExchanges: number
}

type TokenCounter = (text: string) => Promise<number>

async function countMessages(
  messages: readonly RequestMessage[],
  countTokens: TokenCounter,
): Promise<number> {
  const counts = await Promise.all(
    messages.map(async (message) => {
      const input = toolImageTokenInput(message)
      return (
        (await countTokens(input.text)) +
        input.images * TOOL_IMAGE_TOKEN_RESERVE
      )
    }),
  )
  return counts.reduce((sum, count) => sum + count, 0)
}

async function trimTextToBudget(
  text: string,
  maxTokens: number,
  countTokens: TokenCounter,
  suffix = '',
): Promise<string> {
  if ((await countTokens(text)) <= maxTokens) return text
  // A second reduction keeps one replay notice at the end.
  if (suffix && text.endsWith(suffix)) text = text.slice(0, -suffix.length)

  let low = 0
  let high = text.length
  let best = TRUNCATION_MARKER.trim() + suffix
  while (low <= high) {
    const kept = Math.floor((low + high) / 2)
    const headChars = Math.ceil(kept * 0.7)
    const tailChars = Math.max(0, kept - headChars)
    const candidate =
      text.slice(0, headChars) +
      TRUNCATION_MARKER +
      (tailChars > 0 ? text.slice(-tailChars) : '') +
      suffix
    if ((await countTokens(candidate)) <= maxTokens) {
      best = candidate
      low = kept + 1
    } else {
      high = kept - 1
    }
  }
  return best
}

/**
 * Final deterministic guard before an agent completion. It never removes a
 * message, tool call, or tool response; only oversized `content` strings are
 * reduced, preserving provider-required assistant/tool adjacency.
 */
export async function fitMessagesToTokenBudget(
  messages: RequestMessage[],
  inputBudgetTokens: number,
  countTokens: TokenCounter = tokenCount,
): Promise<RequestPreflightResult> {
  const budgetTokens = Math.max(
    1,
    Math.floor(inputBudgetTokens - SAFETY_MARGIN_TOKENS),
  )
  let estimatedTokens = await countMessages(messages, countTokens)
  if (estimatedTokens <= budgetTokens) {
    return {
      messages,
      estimatedTokens,
      budgetTokens,
      truncatedToolResults: 0,
      reducedOlderMessages: 0,
      removedToolExchanges: 0,
    }
  }

  let working = messages
  let truncatedToolResults = 0
  let reducedOlderMessages = 0
  let removedToolExchanges = 0
  const perToolBudget = Math.max(
    MIN_TOOL_RESULT_TOKENS,
    Math.floor(budgetTokens * TOOL_RESULT_BUDGET_RATIO),
  )

  const trimToolResults = async (maxTokens: number) => {
    const next = [...working]
    const protectedStart = protectedResponsesStart(next)
    for (let index = 0; index < next.length; index++) {
      const message = next[index]
      if (message.role !== 'tool' || index >= protectedStart) continue
      const content = await trimTextToBudget(
        message.content,
        maxTokens,
        countTokens,
        message.queryReplay
          ? message.queryReplay.mode === 'lines'
            ? L({
                ko: `\n[전송 예산으로 줄 조회 결과가 잘렸습니다. obsidian_query를 같은 조건과 cursor="${message.queryReplay.cursor}"로 호출하면 이 페이지를 다시 받을 수 있습니다.]`,
                en: `\n[The line query result was truncated by the transmission budget. Call obsidian_query with the same conditions and cursor="${message.queryReplay.cursor}" to replay this page.]`,
              })
            : L({
                ko: `\n[전송 예산으로 노트 조회 결과가 잘렸습니다. ${message.queryReplay.replayCall}로 호출하면 이 페이지를 다시 받을 수 있습니다.]`,
                en: `\n[The note query result was truncated by the transmission budget. Call ${message.queryReplay.replayCall} to replay this page.]`,
              })
          : '',
      )
      if (content !== message.content) {
        const { images: _images, ...textOnly } = message
        next[index] = { ...textOnly, content }
        truncatedToolResults += 1
      }
    }
    working = next
  }

  await trimToolResults(perToolBudget)
  estimatedTokens = await countMessages(working, countTokens)

  if (estimatedTokens > budgetTokens) {
    await trimToolResults(MIN_TOOL_RESULT_TOKENS)
    estimatedTokens = await countMessages(working, countTokens)
  }

  // If accumulated prose/history still crowds the request, reduce only older
  // non-system content. The latest user instruction is never altered.
  if (estimatedTokens > budgetTokens) {
    const latestUserIndex = working.reduce(
      (found, message, index) => (message.role === 'user' ? index : found),
      -1,
    )
    const pinnedTaskIndex = findPinnedTaskIndex(working)
    const next = [...working]
    const protectedStart = protectedResponsesStart(next)
    for (let index = 0; index < next.length; index++) {
      const message = next[index]
      if (
        message.role === 'system' ||
        message.role === 'tool' ||
        index === latestUserIndex ||
        index === pinnedTaskIndex ||
        index >= protectedStart
      ) {
        continue
      }
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .map((part) => (part.type === 'text' ? part.text : ''))
              .join('\n')
      if ((await countTokens(content)) <= MIN_TOOL_RESULT_TOKENS) continue
      next[index] = {
        ...message,
        content: '[Older message content reduced by context preflight.]',
      }
      reducedOlderMessages += 1
      working = next
      estimatedTokens = await countMessages(working, countTokens)
      if (estimatedTokens <= budgetTokens) break
    }
  }

  // If prose reduction was insufficient, remove the oldest complete
  // assistant-tool exchange as a unit. Never leave orphaned tool responses.
  while (estimatedTokens > budgetTokens) {
    const assistantIndex = working.findIndex(
      (message, index) =>
        index < protectedResponsesStart(working) &&
        message.role === 'assistant' &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length > 0,
    )
    if (assistantIndex < 0) break
    let end = assistantIndex + 1
    while (end < working.length && working[end].role === 'tool') end += 1
    if (end === assistantIndex + 1) break
    const next = [...working.slice(0, assistantIndex), ...working.slice(end)]
    const noticeIndex = next.findIndex(
      (message, index) =>
        index >= assistantIndex &&
        index < protectedResponsesStart(next) &&
        message.role === 'assistant',
    )
    if (noticeIndex >= 0 && next[noticeIndex].role === 'assistant') {
      const message = next[noticeIndex]
      next[noticeIndex] = {
        ...message,
        content:
          '[Earlier tool exchange removed by context preflight.]\n' +
          message.content,
      }
    }
    working = next
    removedToolExchanges += 1
    estimatedTokens = await countMessages(working, countTokens)
  }

  if (estimatedTokens > budgetTokens) {
    throw new ContextBudgetExceededError(estimatedTokens, budgetTokens)
  }

  return {
    messages: working,
    estimatedTokens,
    budgetTokens,
    truncatedToolResults,
    reducedOlderMessages,
    removedToolExchanges,
  }
}
