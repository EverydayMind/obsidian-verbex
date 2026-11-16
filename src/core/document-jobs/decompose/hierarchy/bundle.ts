import { canonicalDigest } from '../../../../security/promptInjectionBoundary'
import { validators as compiled } from '../../../../validation/validators'
import type { StyleSnapshot } from '../../../report-style/types'
import { assembleBundleParts } from '../bundleParts'
import * as dialect from '../dialectV2'
import { DecomposeError, type Model, RULES } from '../types'
const validate = compiled.bundle
export function bundleV3Digest(
  bundle: Omit<dialect.DeriveBundleV3, 'derivation_sha256'>,
) {
  return canonicalDigest({
    schema: bundle.schema,
    expectedSampleSha256: bundle.expected_sample_sha256,
    structureSha256: bundle.structure_sha256,
    bindings: bundle.bindings,
    fixedRegions: bundle.fixed_regions,
    dialect: bundle.dialect,
    rulesVersion: bundle.rulesVersion,
    catalogVersion: bundle.catalogVersion,
  })
}
export async function assembleHierarchyBundle(input: {
  model: Model
  snapshot: StyleSnapshot
  samplePath: string
  prefixes: Map<string, string>
}): Promise<dialect.DeriveBundleV3> {
  // Validate shared representatives/ranges before directly assembling /3.
  const original = await assembleBundleParts(input)
  const refs = new Map(
    input.model.bindings.map((b) => [b.marker, b.leadingSpacerRef]),
  )
  const bundle: dialect.DeriveBundleV3 = {
    ...original,
    schema: 'derive-bundle/3',
    dialect: dialect.MD_DIALECT_V2,
    rulesVersion: dialect.HIERARCHY_RULES_VERSION,
    catalogVersion: dialect.ROLE_CATALOG_VERSION,
    derivation_sha256: '',
    bindings: original.bindings.map((b) => {
      const ref = refs.get(b.marker)
      return {
        ...b,
        prefix: input.prefixes.get(b.marker) ?? '',
        ...(ref ? { leadingSpacerRef: ref } : {}),
      }
    }),
  }
  bundle.derivation_sha256 = await bundleV3Digest(bundle)
  if (!validate(bundle)) throw new DecomposeError('invalid_bundle')
  const size = new TextEncoder().encode(JSON.stringify(bundle)).length
  if (size > RULES.bundleBytes) throw new DecomposeError('bundle_limit')
  return bundle
}
