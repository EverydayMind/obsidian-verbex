import type { ToolArgs } from '../tools/localToolCommon'

import * as calculationText from './vaultCalculationText'

export function validateDateArgs(args: ToolArgs): void {
  const unknown = Object.keys(args).find(
    (key) => !['from', 'to', 'add_days'].includes(key),
  )
  if (unknown) throw new Error(calculationText.unknownCalculationArg(unknown))
  if (
    (args.from !== undefined && typeof args.from !== 'string') ||
    (args.to !== undefined && typeof args.to !== 'string')
  )
    throw new Error(calculationText.dateTypeError())
  if (
    args.add_days !== undefined &&
    (typeof args.add_days !== 'number' ||
      !Number.isInteger(args.add_days) ||
      Math.abs(args.add_days) > 36500)
  )
    throw new Error(calculationText.dayRangeError())
}
