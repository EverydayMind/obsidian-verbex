import { type AgentToolOutcome, toolFailed } from '../../core/llm/toolOutcome'
import { L } from '../../i18n/modelText'
import { runtimeGlobal } from '../../platform/runtime'
import { canonicalDigest } from '../../security/promptInjectionBoundary'
import type { ProviderExecutionContext } from '../providerTurnTypes'

import { OwnershipBlockState } from './hostBlockState'

type BlockedCall = {
  argsDigest: string
  name: string
  block: NonNullable<AgentToolOutcome['hostBlock']>
  providerIds: readonly string[]
  displayText: string
}
const MAX_TURNS = 32
const MAX_BLOCKS_PER_TURN = 128

/** Bounded, submitted-turn memory. Parallel in-flight calls are not coalesced. */
export class HostBlockGuard {
  private readonly turns = new Map<string, BlockedCall[]>()
  private readonly fallbackTurns = new WeakMap<object, string>()
  constructor(private readonly state: OwnershipBlockState) {}

  private turn(ctx: ProviderExecutionContext): string {
    const explicit =
      ctx.submittedTurnId ?? ctx.snapshot?.caller?.submittedTurnId
    if (explicit) return explicit
    const owner = ctx.snapshot ?? ctx
    let id = this.fallbackTurns.get(owner)
    if (!id) {
      id = runtimeGlobal().crypto.randomUUID()
      this.fallbackTurns.set(owner, id)
    }
    return id
  }

  async run(
    name: string,
    args: Record<string, unknown>,
    ctx: ProviderExecutionContext,
    execute: () => Promise<AgentToolOutcome>,
  ): Promise<AgentToolOutcome> {
    const turn = this.turn(ctx)
    const argsDigest = await canonicalDigest(args)
    const prior = this.turns.get(turn) ?? []
    this.turns.delete(turn)
    this.turns.set(turn, prior)
    if (this.turns.size > MAX_TURNS) {
      const oldest = [...this.turns.keys()][0]
      if (oldest !== undefined) this.turns.delete(oldest)
    }
    for (const entry of prior) {
      if (entry.name !== name || entry.argsDigest !== argsDigest) continue
      if ((await this.state.key(entry.providerIds)) === entry.block.stateKey)
        return toolFailed(
          L({
            ko: `${entry.displayText}\n상태가 바뀌지 않아 같은 호출을 다시 실행하지 않았습니다.`,
            en: `${entry.displayText}\nThe state is unchanged, so the same call was not executed again.`,
          }),
          {
            terminal: false,
            mutationScope: 'none',
            retry: { allowed: false },
          },
        )
    }
    if (ctx.signal?.aborted)
      return toolFailed(
        L({
          ko: '플러그인 도구 호출이 취소됐습니다.',
          en: `Plugin tool call was cancelled.`,
        }),
        {
          terminal: false,
          mutationScope: 'none',
          retry: { allowed: false },
        },
      )
    const outcome = await execute()
    const block = outcome.hostBlock
    const providerIds = block && this.state.providerIds(block)
    if (block?.code === 'ownership_unverifiable' && providerIds) {
      prior.push({
        name,
        argsDigest,
        block,
        providerIds,
        displayText: outcome.displayText,
      })
      if (prior.length > MAX_BLOCKS_PER_TURN) prior.shift()
    }
    return outcome
  }
}
