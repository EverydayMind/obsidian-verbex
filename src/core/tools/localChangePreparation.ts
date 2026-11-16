import type { ProposedChange } from '../../verbex/types'
import type { ChangeOutcome } from '../../workflow/StepExecutor'

export type StructureObservation = {
  structure: 'issues' | 'clean' | 'unavailable'
}
export type AfterApplyResult =
  | string
  | { text: string; observation?: StructureObservation }

export type LocalChangePreparer = (input: {
  change: ProposedChange
  conversationId?: string
  signal?: AbortSignal
}) => Promise<
  | {
      change: ProposedChange
      afterApply?: (
        status: ChangeOutcome['status'],
      ) => Promise<AfterApplyResult | undefined>
    }
  | undefined
>

export async function prepareLocalChange(
  prepare: LocalChangePreparer | undefined,
  input: Parameters<LocalChangePreparer>[0],
) {
  input.signal?.throwIfAborted()
  try {
    return await prepare?.(input)
  } catch (error) {
    input.signal?.throwIfAborted()
    if (error instanceof Error && error.name === 'AbortError') throw error
    return undefined
  }
}
