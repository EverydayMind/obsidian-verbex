import type { JsonObject } from './protocol'

/** Identity only; the Exporter independently validates the complete bundle. */
export function documentBundleBindings(
  args: JsonObject,
  expectedDigest: string,
) {
  const bundle = args.derive_from
  if (
    !/^[a-f0-9]{64}$/.test(expectedDigest) ||
    !bundle ||
    typeof bundle !== 'object' ||
    Array.isArray(bundle) ||
    bundle.derivation_sha256 !== expectedDigest ||
    !Array.isArray(bundle.bindings)
  )
    throw new Error('Invalid submitted derivation identity.')
  if (bundle.bindings.length > 24)
    throw new Error('Too many submitted bindings.')
  const bindings = bundle.bindings.map((binding) => {
    if (
      !binding ||
      typeof binding !== 'object' ||
      Array.isArray(binding) ||
      typeof binding.marker !== 'string' ||
      typeof binding.representativeRef !== 'string'
    )
      throw new Error('Invalid submitted binding identity.')
    return { marker: binding.marker, ref: binding.representativeRef }
  })
  if (new Set(bindings.map(({ marker }) => marker)).size !== bindings.length)
    throw new Error('Duplicate submitted binding marker.')
  return bindings
}

/** Provider report is a claim, but it must at least bind to the submitted bundle. */
export function assertPreparedDerivation(
  args: JsonObject,
  report: JsonObject,
): void {
  const bundle = args.derive_from
  if (bundle === undefined) return
  if (
    !bundle ||
    typeof bundle !== 'object' ||
    Array.isArray(bundle) ||
    typeof bundle.derivation_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(bundle.derivation_sha256) ||
    report.derivation_sha256 !== bundle.derivation_sha256 ||
    typeof report.conversionFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(report.conversionFingerprint)
  )
    throw new Error(
      'Derived preparation report does not match the submitted bundle.',
    )
}
