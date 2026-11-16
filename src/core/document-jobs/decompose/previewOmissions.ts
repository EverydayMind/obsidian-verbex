import type { StyleSnapshot } from '../../report-style/types'

import { DecomposeError, type Model } from './types'

/** Structure picture IDs may be non-indexed /objectN facts. The preview
 * contract accepts indexed refs only: freeze their owning block explicitly. */
export function previewOmittedRefs(
  model: Model,
  snapshot: StyleSnapshot,
): string[] {
  const nodes = new Set(snapshot.nodes.map((n) => n.ref))
  return [
    ...new Set(
      model.omitted.map((ref) => {
        if (nodes.has(ref)) return ref
        const owner = model.blocks.find((b) =>
          b.omittedObjects.some((o) => o.ref === ref),
        )
        if (!owner || !nodes.has(owner.ref))
          throw new DecomposeError('invalid_omitted_ref', [ref])
        return owner.ref
      }),
    ),
  ]
}
