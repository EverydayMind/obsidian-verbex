import { HWPX_EXPORTER_PROVIDER_ID } from '../contract'

import { RESULT_LIMITS, UnsafeValueError, copyJson } from './descriptorReader'
import { copyDocumentJobArgs } from './documentJobArgs'
import { documentBundleBindings } from './documentJobIdentity'
import { type DerivedPreview, previewSchema } from './documentJobPreviewSchema'
import type { HostContext } from './editorActions'
import { HostInternalReadError, hostInternalRead } from './hostInternalRead'

export type { DerivedPreview } from './documentJobPreviewSchema'

export class PreviewResultTooLarge extends Error {
  constructor() {
    super('preview_result_too_large')
  }
}

/** The Job checks this before drafting; old Exporters must fail closed. */
export async function readDerivedExportOptions(
  host: HostContext,
  signal?: AbortSignal,
) {
  const result = await hostInternalRead(
    host,
    HWPX_EXPORTER_PROVIDER_ID,
    'get_export_options',
    {},
    signal,
  )
  if (
    result.deriveBundleSupport !== 1 ||
    !Array.isArray(result.markerCatalog) ||
    !result.markerCatalog.includes('BODY') ||
    result.markerCatalog.some((marker) => typeof marker !== 'string')
  )
    throw new Error('exporter_outdated')
  return result
}

/** Validate the whole host-only result; never use the display clipping limit. */
export function validateDerivedPreview(
  value: unknown,
  expectedDigest?: string,
): DerivedPreview {
  let safe
  try {
    safe = copyJson(value, RESULT_LIMITS)
  } catch (error) {
    if (error instanceof UnsafeValueError && error.code === 'value_too_large')
      throw new PreviewResultTooLarge()
    throw error
  }
  if (new TextEncoder().encode(JSON.stringify(safe)).byteLength > 256 * 1024)
    throw new PreviewResultTooLarge()
  const parsed = previewSchema.safeParse(safe)
  if (!parsed.success) throw new Error('Invalid derived export preview.')
  if (
    expectedDigest !== undefined &&
    parsed.data.derivation_sha256 !== expectedDigest
  )
    throw new Error('Derived preview digest mismatch.')
  const result = parsed.data
  if (
    result.derivable &&
    new Set(result.markers).size !== result.markers.length
  )
    throw new Error('Duplicate derived preview marker.')
  if (result.derivable && 'converts' in result && result.converts) {
    const { total, topLevel, byMarker, substituted } = result.blocks
    const keys = Object.keys(byMarker)
    if (
      topLevel > total ||
      keys.length !== result.markers.length ||
      keys.some(
        (key) =>
          !result.markers.includes(key) ||
          byMarker[key].requested > total ||
          byMarker[key].applied > total,
      ) ||
      substituted.some((item) => item.count > total) ||
      Object.entries(result.firstBlockByMarker).some(
        ([key, index]) =>
          !Object.prototype.hasOwnProperty.call(byMarker, key) ||
          byMarker[key].applied === 0 ||
          index >= total,
      )
    )
      throw new Error('Inconsistent derived preview counts.')
  }
  // Return the already safely copied raw object. Zod's record construction is not
  // an authority to discard or reinterpret arbitrary marker keys.
  return safe as DerivedPreview
}

export async function previewDerivedExport(
  host: HostContext,
  args: Record<string, unknown>,
  expectedDigest: string,
  signal?: AbortSignal,
): Promise<DerivedPreview> {
  try {
    const snapshot = copyDocumentJobArgs(args)
    const result = await hostInternalRead(
      host,
      HWPX_EXPORTER_PROVIDER_ID,
      'preview_derived_export',
      snapshot,
      signal,
    )
    const validated = validateDerivedPreview(result, expectedDigest)
    const bindings = documentBundleBindings(snapshot, expectedDigest)
    if (validated.derivable) {
      if (
        validated.markers.length !== bindings.length ||
        bindings.some(({ marker }) => !validated.markers.includes(marker))
      )
        throw new Error(
          'Derived preview markers do not match submitted bindings.',
        )
    } else if (
      validated.rejections.some(
        ({ marker, ref }) =>
          marker !== '*' &&
          !bindings.some(
            (binding) => binding.marker === marker && binding.ref === ref,
          ),
      )
    )
      throw new Error(
        'Derived preview rejection does not match submitted bindings.',
      )
    return validated
  } catch (error) {
    if (
      error instanceof HostInternalReadError &&
      error.code === 'PREVIEW_RESULT_TOO_LARGE'
    )
      throw new PreviewResultTooLarge()
    if (error instanceof UnsafeValueError && error.code === 'value_too_large')
      throw new PreviewResultTooLarge()
    throw error
  }
}
