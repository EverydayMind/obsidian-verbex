import { copyJson } from '../../provider/interop/descriptorReader'
import type { ToolArgs } from '../tools/localToolCommon'

import type { StyleApi } from './kordocStyleApi'
import type { ProfileMachine } from './types'

/** A user-requested, bounded excerpt of one paragraph in the measured source. */
export async function readSourceTextRange(input: {
  api: StyleApi
  machine: ProfileMachine
  path: string
  args: ToolArgs
  signal?: AbortSignal
}): Promise<unknown> {
  const { api, machine, path, args, signal } = input
  const ref = args.source_ref as string
  const offset = (args.source_offset as number) ?? 0
  const limit = (args.source_limit as number) ?? 512
  const expectedSourceSha256 = args.expected_source_sha256 as string
  if (signal?.aborted) throw new Error('Style text range cancelled.')
  if (expectedSourceSha256 !== machine.snapshot.source.sha256)
    throw new Error('Style source hash differs from the profile.')
  const paragraph = machine.snapshot.paragraphs.find((item) => item.ref === ref)
  if (!paragraph) throw new Error('Unknown profile paragraph reference.')
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > paragraph.textCodePoints ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 512
  )
    throw new Error('Invalid style text range.')
  if (typeof api.inspectTextRange !== 'function')
    throw new Error('KORDOC source text range unavailable.')
  const raw = copyJson(
    await api.inspectTextRange({
      path,
      expectedSha256: expectedSourceSha256,
      ref,
      offset,
      limit,
      signal,
    }),
    {
      maxDepth: 4,
      maxNodes: 32,
      maxBytes: 8 * 1024,
    },
  ) as Record<string, unknown>
  if (signal?.aborted) throw new Error('Style text range cancelled.')
  if (raw.status !== 'ok')
    throw new Error('Style source text range unavailable or changed.')
  const length = typeof raw.text === 'string' ? [...raw.text].length : -1
  const end = Math.min(offset + limit, paragraph.textCodePoints)
  if (
    raw.sourceSha256 !== expectedSourceSha256 ||
    raw.measurementSha256 !== machine.measurementSha256 ||
    raw.ref !== ref ||
    raw.offset !== offset ||
    raw.total !== paragraph.textCodePoints ||
    length !== end - offset ||
    raw.nextOffset !== (end < paragraph.textCodePoints ? end : null)
  )
    throw new Error('Invalid style source text range response.')
  return {
    sourceSha256: expectedSourceSha256,
    measurementSha256: machine.measurementSha256,
    ref,
    offset,
    text: raw.text,
    total: paragraph.textCodePoints,
    nextOffset: raw.nextOffset,
  }
}
