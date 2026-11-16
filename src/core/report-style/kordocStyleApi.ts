import type { App } from 'obsidian'

import { KORDOC_PROVIDER_ID } from '../../provider/contract'
import {
  copyJson,
  readDataMember,
} from '../../provider/interop/descriptorReader'
import { canonicalDigest } from '../../security/promptInjectionBoundary'

import { validateStyleJson } from './schema'
import type { StyleApi } from './styleApiTypes'
import type { StyleSnapshot } from './types'

export type { StyleApi } from './styleApiTypes'

export class StyleMeasurementError extends Error {
  constructor(readonly code: string) {
    super(`Style measurement failed: ${code}`)
  }
}

const failureCodes = new Set([
  'not_found',
  'unsupported',
  'encrypted',
  'drm',
  'corrupted',
  'too_large',
  'bomb',
  'source_changed',
  'cancelled',
  'timeout',
  'busy',
  'extractor_unavailable',
])
export function safeStyleFailureCode(value: unknown): string {
  return typeof value === 'string' && failureCodes.has(value)
    ? value
    : 'invalid_response'
}

export function getStyleApi(app: App): StyleApi {
  const plugins = (
    app as App & {
      plugins?: {
        plugins?: Record<string, { api?: { styleProfile?: StyleApi } }>
      }
    }
  ).plugins?.plugins
  const api = plugins?.[KORDOC_PROVIDER_ID]?.api?.styleProfile
  if (
    !api ||
    api.version !== 1 ||
    typeof api.extract !== 'function' ||
    typeof api.inspect !== 'function'
  )
    throw new Error('KORDOC styleProfile API v1 unavailable.')
  return api
}
export async function measureStyle(
  api: StyleApi,
  path: string,
  expectedSha256?: string,
  signal?: AbortSignal,
): Promise<{ snapshot: StyleSnapshot; measurementSha256: string }> {
  if (signal?.aborted) throw new Error('Style measurement cancelled.')
  const result = await api.extract({ path, expectedSha256, signal })
  if (signal?.aborted) throw new Error('Style measurement cancelled.')
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new StyleMeasurementError('invalid_response')
  const status = readDataMember(result, 'status')
  if (status !== 'ok')
    throw new StyleMeasurementError(
      safeStyleFailureCode(readDataMember(result, 'code')),
    )
  const sourcePath = readDataMember(result, 'sourcePath')
  const reportedDigest = readDataMember(result, 'measurementSha256')
  const snapshot = validateStyleJson<StyleSnapshot>(
    'snapshot',
    readDataMember(result, 'snapshot'),
  )
  const measurementSha256 = await canonicalDigest(snapshot)
  if (
    sourcePath !== path ||
    reportedDigest !== measurementSha256 ||
    (expectedSha256 && snapshot.source.sha256 !== expectedSha256)
  )
    throw new Error('Style measurement source/digest mismatch.')
  return { snapshot, measurementSha256 }
}

export async function inspectStyle(
  api: StyleApi,
  input: {
    path: string
    expectedSha256: string
    refs: string[]
    signal?: AbortSignal
  },
): Promise<unknown> {
  if (input.signal?.aborted) throw new Error('Style preview cancelled.')
  const response = await api.inspect(input)
  if (input.signal?.aborted) throw new Error('Style preview cancelled.')
  const raw = copyJson(response, {
    maxDepth: 8,
    maxNodes: 1000,
    maxBytes: 64 * 1024,
  }) as Record<string, unknown>
  if (input.signal?.aborted) throw new Error('Style preview cancelled.')
  if (raw.status === 'error')
    return {
      status: 'error',
      code:
        typeof raw.code === 'string'
          ? safeStyleFailureCode(raw.code)
          : 'preview_unavailable',
    }
  if (
    raw.status !== 'ok' ||
    raw.sourceSha256 !== input.expectedSha256 ||
    !Array.isArray(raw.nodes) ||
    raw.nodes.length !== input.refs.length
  )
    throw new Error('Invalid current-source preview.')
  const nodes = raw.nodes as { ref: string; text: string; truncated: boolean }[]
  if (
    nodes.some(
      (node, index) =>
        !node ||
        node.ref !== input.refs[index] ||
        typeof node.text !== 'string' ||
        [...node.text].length > 160 ||
        typeof node.truncated !== 'boolean',
    )
  )
    throw new Error('Invalid preview node.')
  const result = {
    status: 'ok',
    sourceSha256: input.expectedSha256,
    nodes: nodes.map(({ ref, text, truncated }) => ({ ref, text, truncated })),
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 16 * 1024)
    throw new Error('Preview exceeds byte limit.')
  return result
}
