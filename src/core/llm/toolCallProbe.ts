import { VerbexSettings } from '../../settings/schema/setting.types'
import { ChatModel } from '../../types/chat-model.types'
import { LLMProvider } from '../../types/provider.types'
import { parseToolProposals } from '../../utils/chat/parse-tool-proposals'
import { getErrorStatus, isAbortError } from '../../utils/llm/retry'

import { gatedChatStep } from './budgetGate'

export type ToolCallProbeResult =
  | { kind: 'structured' | 'text_call' | 'no_call'; provider?: string }
  | { kind: 'rejected' | 'error'; message: string }

export type ToolCallProbeOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  runStep?: typeof gatedChatStep
}

const name = 'verbex_probe_echo'

export async function probeToolCall(
  provider: LLMProvider,
  model: ChatModel,
  settings: VerbexSettings,
  options?: ToolCallProbeOptions,
): Promise<ToolCallProbeResult> {
  options?.signal?.throwIfAborted()
  const probeModel = {
    ...model,
    id: 'verbex-probe-model',
    providerId: provider.id,
    supportsTools: true,
  } as ChatModel
  const probeSettings = {
    ...settings,
    providers: [provider],
    chatModels: [probeModel],
  }
  const runStep = options?.runStep ?? gatedChatStep
  const llmOptions =
    options?.signal || options?.timeoutMs !== undefined
      ? {
          ...(options.signal ? { signal: options.signal } : {}),
          ...(options.timeoutMs !== undefined
            ? { timeoutMs: options.timeoutMs }
            : {}),
        }
      : undefined
  try {
    const response = await runStep({
      settings: probeSettings,
      stepModel: probeModel.id,
      requiredBlocks: [
        { role: 'system', content: 'Call the provided tool once.' },
        {
          role: 'user',
          content: 'Call verbex_probe_echo once with value "ok".',
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name,
            description: 'Echo a value.',
            parameters: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
            },
          },
        },
      ],
      retry: { numOfAttempts: 1 },
      ...(llmOptions ? { options: llmOptions } : {}),
    })
    const providerField = response.provider
      ? { provider: response.provider }
      : {}
    for (const call of response.toolCalls) {
      if (call.function.name !== name) continue
      try {
        const args: unknown = JSON.parse(call.function.arguments ?? '')
        if (args !== null && typeof args === 'object' && !Array.isArray(args))
          return { kind: 'structured', ...providerField }
      } catch {
        /* Try text proposals below. */
      }
    }
    return {
      kind: parseToolProposals(response.text, new Set([name])).length
        ? 'text_call'
        : 'no_call',
      ...providerField,
    }
  } catch (error) {
    if (options?.signal?.aborted || isAbortError(error)) {
      throw error
    }
    const status = getErrorStatus(error)
    const raw: unknown =
      error instanceof Error &&
      'rawError' in error &&
      error.rawError instanceof Error
        ? error.rawError
        : error
    const message = (raw instanceof Error ? raw.message : String(raw)).slice(
      0,
      500,
    )
    return {
      kind:
        status !== null && status >= 400 && status < 500 ? 'rejected' : 'error',
      message,
    }
  }
}
