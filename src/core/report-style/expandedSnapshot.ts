// Independent validation for the provisional compact transport's expanded
// snapshot. Existing snapshot/1 and profile limits remain unchanged.

import { copyJson } from '../../provider/interop/descriptorReader'
import { canonicalDigest } from '../../security/promptInjectionBoundary'
import { validators as compiled } from '../../validation/validators'

import { validateSnapshotReferences } from './schema'
import type { StyleSnapshot } from './types'

const EXPANDED_LIMIT = 16 * 1024 * 1024
const validator = compiled.expandedSnapshot

export async function validateExpandedSnapshot(
  input: unknown,
  expectedMeasurementSha256: string,
  expectedSourceSha256: string,
): Promise<StyleSnapshot> {
  if (
    typeof expectedMeasurementSha256 !== 'string' ||
    typeof expectedSourceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(expectedMeasurementSha256) ||
    !/^[a-f0-9]{64}$/.test(expectedSourceSha256)
  )
    throw new Error('Expected measurement and source digests are required.')
  const value = copyJson(input, {
    maxBytes: 4 * EXPANDED_LIMIT,
    maxDepth: 32,
    maxNodes: 1500000,
  })
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength > EXPANDED_LIMIT
  )
    throw new Error('Expanded snapshot exceeds 16 MiB.')
  if (!validator(value)) throw new Error('Invalid expanded snapshot schema.')
  const snapshot = value as unknown as StyleSnapshot
  validateSnapshotReferences(snapshot, EXPANDED_LIMIT)
  if (
    snapshot.source.sha256 !== expectedSourceSha256 ||
    (await canonicalDigest(snapshot)) !== expectedMeasurementSha256
  )
    throw new Error('Expanded snapshot digest mismatch.')
  return snapshot
}
