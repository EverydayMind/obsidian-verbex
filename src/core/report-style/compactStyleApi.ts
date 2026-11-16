import { copyJson } from '../../provider/interop/descriptorReader'

import { decodeCompactSnapshot } from './compactSnapshot'
import {
  StyleMeasurementError,
  measureStyle,
  safeStyleFailureCode,
} from './kordocStyleApi'
import type { StyleApi } from './styleApiTypes'

export async function measureCompactStyle(
  api: StyleApi,
  path: string,
  expectedSha256: string,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new Error('Style measurement cancelled.')
  if (!api.extractCompact)
    throw new Error('KORDOC compact style measurement unavailable.')
  const response = await api.extractCompact({ path, expectedSha256, signal })
  if (signal?.aborted) throw new Error('Style measurement cancelled.')
  const raw = copyJson(response, {
    maxDepth: 32,
    maxNodes: 1500000,
    maxBytes: 16 * 1024 * 1024,
  }) as Record<string, unknown>
  if (
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    raw.status === 'error'
  ) {
    const code = safeStyleFailureCode(raw.code)
    throw new StyleMeasurementError(code)
  }
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    raw.status !== 'ok' ||
    raw.sourcePath !== path ||
    typeof raw.measurementSha256 !== 'string'
  )
    throw new Error('Compact style measurement unavailable or source changed.')
  const snapshot = await decodeCompactSnapshot(
    raw.packed,
    raw.measurementSha256,
    expectedSha256,
  )
  if (signal?.aborted) throw new Error('Style measurement cancelled.')
  return { snapshot, measurementSha256: raw.measurementSha256 }
}

/** Preserve ordinary refresh behavior; only oversized compact profiles retry. */
export async function refreshCompactStyle(
  api: StyleApi,
  path: string,
  byteHash: (path: string) => Promise<string>,
  signal?: AbortSignal,
) {
  try {
    return await measureStyle(api, path, undefined, signal)
  } catch (error) {
    if (
      !(error instanceof StyleMeasurementError) ||
      error.code !== 'too_large' ||
      !api.extractCompact
    )
      throw error
    const hash = await byteHash(path)
    return measureCompactStyle(api, path, hash, signal)
  }
}
