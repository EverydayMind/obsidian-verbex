import { randomBytes } from '../../platform/node/api'
import { runtimeGlobal } from '../../platform/runtime'
import { ChatModel } from '../../types/chat-model.types'
import { RequestMessage } from '../../types/llm/request'
import {
  ResponsesOutputItem,
  ResponsesReplayState,
  ResponsesScope,
} from '../../types/llm/responses'
import { LLMProvider } from '../../types/provider.types'
import { sha256Hex } from '../../utils/hash'

import { publicToolMessages } from './privateToolTranscript'
import { ResponsesProtocolError } from './responsesErrors'

// No output cache: only authenticate Items already inside approved messages.
function newReplaySecret(): string {
  if (runtimeGlobal().crypto?.getRandomValues)
    return Array.from(
      runtimeGlobal().crypto.getRandomValues(new Uint8Array(32)),
    ).join(',')
  // Desktop/test fallback; mobile uses Web Crypto without a Node dependency.

  return randomBytes(32).toString('hex')
}
const replaySecret = newReplaySecret()
let turnSequence = 0

export function newAgentTurnId(): string {
  return `agent-turn-${Date.now()}-${++turnSequence}-${Math.random().toString(36).slice(2)}`
}

export async function responsesScope(
  model: ChatModel,
  provider: LLMProvider,
  messages: RequestMessage[],
): Promise<ResponsesScope> {
  const turnId =
    messages.find((message) => message.agentTurnId)?.agentTurnId ??
    newAgentTurnId()
  return {
    turnId,
    configHash: await sha256Hex(
      JSON.stringify({
        provider,
        model,
        apiMode: 'responses',
      }),
    ),
  }
}

async function seal(
  scope: ResponsesScope,
  items: ResponsesOutputItem[],
): Promise<string> {
  return sha256Hex(JSON.stringify({ secret: replaySecret, scope, items }))
}

export async function makeResponsesReplay(
  scope: ResponsesScope,
  items: ResponsesOutputItem[],
): Promise<ResponsesReplayState> {
  const snapshot = JSON.parse(JSON.stringify(items)) as ResponsesOutputItem[]
  return {
    protocol: 'responses',
    scope: { ...scope },
    items: snapshot,
    seal: await seal(scope, snapshot),
  }
}

export async function assertResponsesReplay(
  state: ResponsesReplayState,
  scope: ResponsesScope,
): Promise<void> {
  if (
    !state ||
    !state.scope ||
    !Array.isArray(state.items) ||
    state.protocol !== 'responses' ||
    state.scope.configHash !== scope.configHash ||
    state.scope.turnId !== scope.turnId ||
    state.seal !== (await seal(state.scope, state.items))
  ) {
    throw new ResponsesProtocolError(
      'Responses continuation does not belong to this agent turn/model/provider configuration, or its Items were changed. Start a new agent turn.',
    )
  }
}

/** Used by every context reducer; harness user corrections never reset it. */
export function protectedResponsesStart(
  messages: readonly {
    role: string
    agentTurnId?: unknown
    responsesReplay?: unknown
  }[],
): number {
  const firstReplay = messages.findIndex((message) =>
    Boolean(message.responsesReplay),
  )
  if (firstReplay < 0) return messages.length
  const start = messages.findIndex((message) => Boolean(message.agentTurnId))
  return start >= 0 ? start : 0
}

export function assertNoResponsesReplay(messages: RequestMessage[]): void {
  if (
    messages.some(
      (message) => message.role === 'assistant' && message.responsesReplay,
    )
  ) {
    throw new ResponsesProtocolError(
      'Cannot change API/model/provider while a Responses continuation is active. Start a new agent turn.',
    )
  }
}

/** Clear the private protocol state before loop results can reach UI/storage. */
export function publicAgentMessages(
  messages: RequestMessage[],
  isPrivateTool?: (name: string) => boolean,
): RequestMessage[] {
  return publicToolMessages(messages, isPrivateTool).map((message) => {
    const { agentTurnId: _turnId, ...rest } = message
    if (rest.role !== 'assistant') return rest
    const { responsesReplay: _replay, ...assistant } = rest
    return assistant
  })
}
