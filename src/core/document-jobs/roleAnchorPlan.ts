import type { SavedOutputAnchorPage } from '../../provider/interop/outputAnchorRead'
import type { Binding } from '../report-style/types'

import { metaWithoutRule } from './metaAnchor'

export type RoleAnchor = {
  blockIndex: number
  section: 0
  paragraph: number
  requestedVariant?: string | null
  variantMissing?: boolean
  appliedMarker: string | null
}
export type RoleAnchorPlan = {
  metaWithoutRule: number
  anchors: RoleAnchor[]
  selected: number[]
  byMarker: Record<string, number[]>
}

/** A partial anchor stream cannot establish exact per-marker totals. */
export function planRoleAnchors(
  bindings: readonly Binding[],
  pages: readonly SavedOutputAnchorPage[],
): RoleAnchorPlan {
  if (
    !pages.length ||
    pages.some((page) => page.version === 'saved-output-anchors/0.1')
  )
    throw new Error('Applied marker anchors unavailable.')
  const first = pages[0]
  if (
    !Number.isSafeInteger(first.total) ||
    first.total < 0 ||
    first.total > 50000 ||
    pages.length > 100
  )
    throw new Error('Invalid anchor stream size.')
  let offset = 0
  const anchors: RoleAnchor[] = []
  for (const page of pages) {
    if (
      page.version === 'saved-output-anchors/0.1' ||
      page.version !== first.version ||
      page.offset !== offset ||
      page.total !== first.total ||
      page.archiveSha256 !== first.archiveSha256 ||
      page.sectionSha256 !== first.sectionSha256 ||
      page.preparationId !== first.preparationId ||
      page.preparationDigest !== first.preparationDigest ||
      page.destination !== first.destination
    )
      throw new Error('Inconsistent anchor pages.')
    offset += page.anchors.length
    if (page.nextOffset !== (offset < page.total ? offset : null))
      throw new Error('Inconsistent anchor page offsets.')
    anchors.push(...page.anchors)
  }
  if (offset !== first.total || pages.at(-1)?.nextOffset !== null)
    throw new Error('Anchor stream incomplete.')
  const blocks = new Set<number>(),
    positions = new Set<number>()
  for (const anchor of anchors) {
    if (
      !Number.isSafeInteger(anchor.blockIndex) ||
      anchor.blockIndex < 0 ||
      anchor.section !== 0 ||
      !Number.isSafeInteger(anchor.paragraph) ||
      anchor.paragraph < 0 ||
      blocks.has(anchor.blockIndex) ||
      positions.has(anchor.paragraph)
    )
      throw new Error('Invalid output anchors.')
    blocks.add(anchor.blockIndex)
    positions.add(anchor.paragraph)
  }
  anchors.sort((a, b) => a.blockIndex - b.blockIndex)
  const roles = bindings.filter(
    (binding) => !binding.marker.startsWith('SPACE:'),
  )
  if (
    new Set(roles.map((role) => role.marker)).size !== roles.length ||
    roles.length > 14
  )
    throw new Error('Invalid role bindings.')
  const byMarker: Record<string, number[]> = Object.fromEntries(
    roles.map((role) => [role.marker, []]),
  )
  for (const anchor of anchors)
    if (
      !metaWithoutRule(anchor) &&
      anchor.appliedMarker !== null &&
      Object.prototype.hasOwnProperty.call(byMarker, anchor.appliedMarker)
    )
      byMarker[anchor.appliedMarker].push(anchor.blockIndex)
  const representatives = roles.flatMap((role) =>
    byMarker[role.marker].slice(0, 1),
  )
  const firsts = new Set(representatives)
  const others = anchors
    .filter(
      (anchor) =>
        !metaWithoutRule(anchor) &&
        anchor.appliedMarker !== null &&
        Object.prototype.hasOwnProperty.call(byMarker, anchor.appliedMarker) &&
        !firsts.has(anchor.blockIndex),
    )
    .map((anchor) => anchor.blockIndex)
  return {
    anchors,
    metaWithoutRule: anchors.filter(metaWithoutRule).length,
    byMarker,
    selected: [...representatives, ...others].slice(0, 200),
  }
}
