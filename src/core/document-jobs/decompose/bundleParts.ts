import { canonicalDigest } from '../../../security/promptInjectionBoundary'
import type { StyleSnapshot } from '../../report-style/types'

import { DecomposeError, type Model, RULES } from './types'

export async function assembleBundleParts(input: {
  model: Model
  snapshot: StyleSnapshot
  samplePath: string
}) {
  const { model, snapshot } = input
  const bindings = model.bindings.map(({ key, marker, representativeRef }) => ({
    key,
    marker,
    representativeRef,
  }))
  if (
    bindings.length > RULES.bindings ||
    model.fixedRegions.length > RULES.ranges ||
    model.fixedRegions.reduce((n, r) => n + r.replacements.length, 0) >
      RULES.replacements
  )
    throw new DecomposeError('bundle_limit')
  if (!bindings.some((b) => b.marker === 'BODY'))
    throw new DecomposeError('body_unavailable')
  if (
    new Set(bindings.map((b) => b.key)).size !== bindings.length ||
    new Set(bindings.map((b) => b.marker)).size !== bindings.length
  )
    throw new DecomposeError('duplicate_binding')
  const nodes = new Map(snapshot.nodes.map((n) => [n.ref, n]))
  const top = snapshot.nodes.filter(
    (n) => n.parentRef === null && n.kind === 'paragraph',
  )
  const fixedRefs = new Set<string>()
  let previousEnd = -1
  for (const region of model.fixedRegions) {
    const start = top.findIndex((n) => n.ref === region.from_ref),
      end = top.findIndex((n) => n.ref === region.to_ref)
    if (start < 1 || end < start || start <= previousEnd)
      throw new DecomposeError('invalid_fixed_range')
    previousEnd = end
    const roots = new Set(top.slice(start, end + 1).map((n) => n.ref))
    const regionRefs = new Set<string>()
    for (const n of snapshot.nodes) {
      let root = n
      while (root.parentRef && nodes.has(root.parentRef))
        root = nodes.get(root.parentRef) ?? root
      if (roots.has(root.ref)) {
        regionRefs.add(n.ref)
        fixedRefs.add(n.ref)
      }
    }
    if (
      region.replacements.some(
        (r) =>
          !regionRefs.has(r.paragraphRef) ||
          nodes.get(r.paragraphRef)?.kind !== 'paragraph',
      )
    )
      throw new DecomposeError('invalid_replacement')
  }
  if (
    bindings.some(
      (b) =>
        nodes.get(b.representativeRef)?.kind !== 'paragraph' ||
        fixedRefs.has(b.representativeRef),
    )
  )
    throw new DecomposeError('invalid_representative')
  const structureSha256 = await canonicalDigest(snapshot.nodes)
  return {
    sample_path: input.samplePath,
    expected_sample_sha256: snapshot.source.sha256,
    structure_sha256: structureSha256,
    bindings,
    fixed_regions: model.fixedRegions,
  }
}
