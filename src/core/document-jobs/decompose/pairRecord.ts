import { validators as compiled } from '../../../validation/validators'

import type { PairRecord } from './jobDecomposition'
import { DecomposeError } from './types'

const validate = compiled.record
export function parsePairRecord(value: unknown): PairRecord | null {
  if (value === undefined || value === null) return null
  if (!validate(value)) throw new DecomposeError('invalid_pair_record')
  const record = value as PairRecord
  if (/[/\\]/.test(record.textFile) || !/\.md$/i.test(record.textFile))
    throw new DecomposeError('invalid_pair_record')
  return record
}
