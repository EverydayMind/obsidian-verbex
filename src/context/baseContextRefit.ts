import type { ExecutionPlan } from '../core/batch/contextPacker'
import { estimateTokens } from '../utils/llm/estimateTokens'
import type { VerbexContextTrace } from '../verbex/types'

import type { AgentContextPresenter } from './AgentContextPresenter'
import type { FitFacts, FitMode } from './baseContextFit'
import type { ContextAssembler } from './ContextAssembler'

export function refitBaseContext(input: {
  plan: ExecutionPlan
  assembler: ContextAssembler
  presenter: Pick<AgentContextPresenter, 'fitAgentContext'>
  context: VerbexContextTrace | null
  mode: FitMode
  request: string
  catalogTokenBudget: number
  catalogCandidateLimit: number
  signal?: AbortSignal
}): { plan: ExecutionPlan; fitted?: FitFacts } {
  const { plan, context } = input
  const packed = plan.packed
  const block = packed.blocks.find((item) => item.packetId === 'base_context')
  if (
    packed.status !== 'ready' ||
    !context ||
    input.signal?.aborted ||
    !packed.packets.some((item) => item.id === 'base_context') ||
    block?.mode === 'full' ||
    packed.deferredPacketIds.includes('base_context')
  )
    return { plan }
  const target =
    (block?.renderedTokens ?? 0) +
    packed.budgetTokens -
    packed.renderedTokens -
    (block ? 0 : estimateTokens('\n\n'))
  if (target <= 0) return { plan }
  const result = input.presenter.fitAgentContext(
    input.request,
    context,
    input.mode,
    {
      targetTokens:
        target - input.assembler.refitWrapperTokens(plan, 'base_context'),
      catalogTokenBudget: input.catalogTokenBudget,
      catalogCandidateLimit: input.catalogCandidateLimit,
    },
  )
  if (!result || input.signal?.aborted) return { plan }
  const fittedPlan = input.assembler.refitSection(
    plan,
    'base_context',
    result.text,
    target,
  )
  return fittedPlan === plan
    ? { plan }
    : { plan: fittedPlan, fitted: result.facts }
}
