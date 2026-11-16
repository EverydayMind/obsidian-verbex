import type { ChangeOutcome } from '../../workflow/StepExecutor'

import type { AfterApplyResult } from './localChangePreparation'

export async function observePreparedChange(
  afterApply:
    | ((
        status: ChangeOutcome['status'],
      ) => Promise<AfterApplyResult | undefined>)
    | undefined,
  status: ChangeOutcome['status'],
) {
  if (status !== 'applied' && status !== 'partially_applied') return undefined
  try {
    return await afterApply?.(status)
  } catch {
    return undefined
  }
}
