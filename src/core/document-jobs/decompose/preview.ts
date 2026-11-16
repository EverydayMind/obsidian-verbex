import { sha256Hex } from '../../../utils/hash'
import { validators as compiled } from '../../../validation/validators'

import type { DeriveBundleV3 } from './dialectV2'
import { bundleV3Digest } from './hierarchy/bundle'
import { DecomposeError, RULES } from './types'

const validateResult = compiled.preview
const validateBundleV3 = compiled.bundle
export type DecompositionPreviewInput = {
  derive_from: unknown
  markdown: string
  expected_markdown_sha256: string
  allowed: { omitted_refs: string[] }
}
export type DecompositionPreviewPort = {
  preview(
    input: DecompositionPreviewInput,
    signal?: AbortSignal,
  ): Promise<unknown>
}
export function parseDecompositionPreview(
  value: unknown,
): Record<string, unknown> {
  if (
    new TextEncoder().encode(JSON.stringify(value)).length > 256 * 1024 ||
    !validateResult(value)
  )
    throw new DecomposeError('invalid_preview_result')
  return value as Record<string, unknown>
}
export async function validateDecompositionPreviewInput(
  input: DecompositionPreviewInput,
): Promise<void> {
  if (
    !validateBundleV3(input.derive_from) ||
    new TextEncoder().encode(input.markdown).length > RULES.textBytes ||
    input.allowed.omitted_refs.length > 2000 ||
    new Set(input.allowed.omitted_refs).size !==
      input.allowed.omitted_refs.length ||
    input.allowed.omitted_refs.some(
      (r) => !/^s\d+(?:\/(?:p\d+|t\d+|c\d+\.\d+|h\d+|f\d+))*$/.test(r),
    ) ||
    (await sha256Hex(input.markdown)) !== input.expected_markdown_sha256
  )
    throw new DecomposeError('invalid_preview_input')
  const b = input.derive_from as {
    schema: string
    expected_sample_sha256: string
    structure_sha256: string
    bindings: unknown
    fixed_regions: unknown
    derivation_sha256: string
  }
  if (
    (await bundleV3Digest(input.derive_from as DeriveBundleV3)) !==
    b.derivation_sha256
  )
    throw new DecomposeError('invalid_bundle_digest')
}
export async function previewDecomposition(
  port: DecompositionPreviewPort,
  input: DecompositionPreviewInput,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  await validateDecompositionPreviewInput(input)
  const raw = await port.preview(input, signal)
  signal?.throwIfAborted()
  return parseDecompositionPreview(raw)
}
