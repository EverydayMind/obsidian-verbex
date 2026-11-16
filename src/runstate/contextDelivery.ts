import type { FitFacts } from '../context/baseContextFit'
import type { ContextBuildResult } from '../context/ContextBuilder'
import type { EffectiveContextMode } from '../context/contextPolicy'
import type {
  ContextContentMode,
  ContextPackerResult,
} from '../core/batch/contextPacker'

export type ContextDelivery = {
  fitted?: Pick<
    FitFacts,
    'fromTokens' | 'toTokens' | 'removedItems' | 'truncatedItems'
  >
  mode: EffectiveContextMode | 'not_built'
  /** Builder selection only; packet rendering can omit or shorten these items. */
  builder: {
    items: {
      source: ContextBuildResult['items'][number]['source']
      path: string
      included: boolean
    }[]
    omitted: number
    formatSourceExclusions: string[]
    formatSourceMarked: number
  }
  packet:
    | { status: 'included'; mode: ContextContentMode }
    | { status: 'dropped' | 'deferred' | 'absent' }
}

export function buildContextDelivery(
  mode: EffectiveContextMode,
  context: ContextBuildResult | null,
  packed: Pick<
    ContextPackerResult,
    'blocks' | 'droppedPacketIds' | 'deferredPacketIds'
  >,
  fitted?: FitFacts,
): ContextDelivery {
  const seen = new Set<string>()
  const items: ContextDelivery['builder']['items'] = []
  let omitted = 0
  for (const item of context?.items ?? []) {
    if (seen.has(item.path)) continue
    seen.add(item.path)
    if (items.length < 50)
      items.push({
        source: item.source,
        path: item.path,
        included: item.included_in_context,
      })
    else omitted++
  }
  const block = packed.blocks.find((item) => item.packetId === 'base_context')
  const packet: ContextDelivery['packet'] = block
    ? { status: 'included', mode: block.mode }
    : {
        status: packed.droppedPacketIds.includes('base_context')
          ? 'dropped'
          : packed.deferredPacketIds.includes('base_context')
            ? 'deferred'
            : 'absent',
      }
  return {
    ...(fitted
      ? {
          fitted: {
            fromTokens: fitted.fromTokens,
            toTokens: fitted.toTokens,
            removedItems: fitted.removedItems,
            truncatedItems: fitted.truncatedItems,
          },
        }
      : {}),
    mode: context ? mode : 'not_built',
    builder: {
      items,
      omitted,
      formatSourceExclusions: [
        ...new Set(context?.formatSourceExclusions ?? []),
      ].slice(0, 10),
      formatSourceMarked: (context?.items ?? []).filter(
        (item) => item.formatSource,
      ).length,
    },
    packet,
  }
}
