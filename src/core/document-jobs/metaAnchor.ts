/** Only explicit version-0.3 evidence excludes a META fallback from BODY. */
export function metaWithoutRule(anchor: {
  appliedMarker: string | null
  requestedVariant?: string | null
  variantMissing?: boolean
}): boolean {
  return (
    anchor.appliedMarker === 'BODY' &&
    anchor.requestedVariant === 'META' &&
    anchor.variantMissing === true
  )
}
