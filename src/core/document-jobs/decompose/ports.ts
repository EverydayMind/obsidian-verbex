import { canonicalDigest } from '../../../security/promptInjectionBoundary'
import { validators as compiled } from '../../../validation/validators'
import type { StyleApi } from '../../report-style/kordocStyleApi'
import { readSourceTextRange } from '../../report-style/sourceTextRead'
import type { ProfileMachine, StyleSnapshot } from '../../report-style/types'

import { DecomposeError, type DeriveStructure, RULES } from './types'

const validate = compiled.structure
export type StructurePort = {
  inspect(input: {
    path: string
    expectedSha256: string
    signal?: AbortSignal
  }): Promise<unknown>
}
export async function readStructure(
  port: StructurePort,
  path: string,
  snapshot: StyleSnapshot,
  signal?: AbortSignal,
): Promise<DeriveStructure> {
  signal?.throwIfAborted()
  const raw = await port.inspect({
    path,
    expectedSha256: snapshot.source.sha256,
    signal,
  })
  signal?.throwIfAborted()
  if (!validate(raw)) throw new DecomposeError('invalid_structure')
  const result = raw as DeriveStructure
  if (
    result.sample_sha256 !== snapshot.source.sha256 ||
    result.structure_sha256 !== (await canonicalDigest(snapshot.nodes))
  )
    throw new DecomposeError('structure_mismatch')
  return result
}
/** Budget the entire extraction before the first range read. No partial text is projected. */
export async function readDecomposeText(input: {
  api: StyleApi
  path: string
  snapshot: StyleSnapshot
  measurementSha256: string
  signal?: AbortSignal
}): Promise<Record<string, string>> {
  const bytes = input.snapshot.paragraphs.reduce(
    (n, p) => n + p.textCodePoints * 4,
    0,
  )
  if (bytes > RULES.textBytes) throw new DecomposeError('too_large')
  const machine = {
    snapshot: input.snapshot,
    measurementSha256: input.measurementSha256,
  } as ProfileMachine
  const texts: Record<string, string> = {}
  for (const p of input.snapshot.paragraphs) {
    texts[p.ref] = ''
    for (let offset = 0; offset < p.textCodePoints; offset += 512) {
      input.signal?.throwIfAborted()
      const part = (await readSourceTextRange({
        api: input.api,
        machine,
        path: input.path,
        signal: input.signal,
        args: {
          source_ref: p.ref,
          source_offset: offset,
          source_limit: 512,
          expected_source_sha256: input.snapshot.source.sha256,
        },
      })) as { text: string }
      texts[p.ref] += part.text
    }
  }
  return texts
}
