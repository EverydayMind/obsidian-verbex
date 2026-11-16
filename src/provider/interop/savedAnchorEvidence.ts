import type { SavedOutputAnchorPage } from './outputAnchorRead'

export type SavedAnchorEvidence = {
  requestedVariant?: string | null
  variantMissing?: boolean
  appliedMarker?: string | null
}

/** Host-observed variant evidence is retained without sending it to KORDOC. */
export function attachAnchorEvidence<T>(
  references: T[],
  anchors: SavedOutputAnchorPage['anchors'],
) {
  return references.map((item, i) => {
    const anchor = anchors[i]
    return {
      ...item,
      ...('requestedVariant' in anchor
        ? {
            appliedMarker: anchor.appliedMarker,
            requestedVariant: anchor.requestedVariant,
            variantMissing: anchor.variantMissing,
          }
        : {}),
    }
  })
}

export function anchorCoordinates(anchors: SavedOutputAnchorPage['anchors']) {
  return anchors.map(({ blockIndex, section, paragraph }) => ({
    blockIndex,
    section,
    paragraph,
  }))
}
