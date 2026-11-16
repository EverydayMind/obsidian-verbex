import type {
  ObservedDraftBlock,
  ObservedMarker,
  ObservedSelection,
} from './observedBlockRead'
import type { RoleStyleVariant } from './profileV2'
import { parseVariantMarker } from './variantMarkers'

type Resolution = 'resolved' | 'ambiguous' | 'unmapped'
export type DraftRoleNode = {
  index: number
  parentIndex: number | null
  kind: string
  container: string
  headingLevel: number | null
  state: Resolution
  role: string | null
  candidateRoles: string[]
  unmappedPossible: boolean
  contextUnknown: boolean
  requestSource: 'explicit' | 'implicit' | 'redacted' | 'unavailable'
  requested: ObservedMarker
  applied: ObservedMarker
  fallbacks: string[]
  inheritedCell: {
    index: number
    applied: ObservedMarker
    fallbacks: string[]
  } | null
  text: ObservedSelection['text']
}
type Pair = { base: string; variant: string | null }
const structural = (block: ObservedDraftBlock) =>
  block.kind === 'table' || block.kind === 'table_cell'
const stylePair = (style: RoleStyleVariant): Pair => {
  const parsed = parseVariantMarker(style.marker)
  return parsed
    ? { base: parsed.base, variant: parsed.variant }
    : { base: style.marker, variant: style.variant }
}
const markerPair = (marker: ObservedMarker): Pair | null =>
  marker.markerState === 'observed' &&
  marker.marker &&
  marker.variantState !== 'redacted'
    ? { base: marker.marker.slice(2, -2), variant: marker.variant }
    : null
const same = (left: Pair, right: Pair) =>
  left.base === right.base && left.variant === right.variant

/** Resolve only observed requests; applied markers are facts, never evidence of intent. */
export function projectDraftRoles(
  blocks: readonly ObservedDraftBlock[],
  styles: readonly RoleStyleVariant[],
): DraftRoleNode[] {
  const nodes: DraftRoleNode[] = []
  const byIndex = new Map<number, DraftRoleNode>()
  const headings: { index: number; level: number }[] = []
  const nearestCell = (
    block: ObservedDraftBlock,
  ): ObservedDraftBlock | null => {
    let parent = block.parentIndex
    while (parent !== null) {
      const ancestor = blocks[parent]
      if (ancestor.kind === 'table_cell') return ancestor
      parent = ancestor.parentIndex
    }
    return null
  }
  for (const block of blocks) {
    if (structural(block)) continue
    let parent = block.parentIndex
    while (parent !== null && structural(blocks[parent]))
      parent = blocks[parent].parentIndex
    if (block.kind === 'heading' && block.parentIndex === null) {
      const level = block.headingLevel
      if (level === null) throw new Error('Heading level required.')
      while (headings.length && headings[headings.length - 1].level >= level)
        headings.pop()
      parent = headings.at(-1)?.index ?? null
      headings.push({ index: block.index, level })
    } else if (parent === null) parent = headings.at(-1)?.index ?? null
    const parentNode = parent === null ? null : byIndex.get(parent)
    if (parent !== null && !parentNode)
      throw new Error('Draft parent must precede child.')
    const cell = nearestCell(block)
    const container =
      block.container === 'caption' || block.container === 'footnote'
        ? block.container
        : cell
          ? 'cell'
          : 'body'
    const inherited =
      block.selection.requestKind === 'inherited_cell' ? cell : null
    const source = inherited?.selection ?? block.selection
    const explicit = source.requestKind === 'explicit'
    const redacted =
      source.requested.markerState === 'redacted' ||
      source.requested.variantState === 'redacted'
    const redactedVariantBase =
      explicit &&
      source.requested.markerState === 'observed' &&
      source.requested.marker &&
      source.requested.variantState === 'redacted'
        ? source.requested.marker.slice(2, -2)
        : null
    const redactedMarker =
      explicit &&
      (source.requested.markerState === 'redacted' ||
        (source.requested.markerState === 'none' &&
          source.requested.variantState === 'redacted'))
    const sourcePairs = explicit
      ? [markerPair(source.requested)].filter((pair): pair is Pair => !!pair)
      : (source.candidates ?? [])
          .map(markerPair)
          .filter((pair): pair is Pair => !!pair)
    // Prefix rules are applied formatting, not an explicit semantic request.
    // If a profile maps one, retain it as a possibility without resolving it.
    const prefix = block.selection.prefix?.marker
    const prefixUnknown = block.selection.prefix !== null && !prefix
    const prefixBase = prefix ? prefix.slice(2, -2).trim() : null
    const roles = new Set<string>()
    let contextUnknown = false,
      prefixPossible = false
    for (const style of styles) {
      if (
        !style.role ||
        (style.context.container && style.context.container !== container)
      )
        continue
      const pair = stylePair(style)
      const prefixMatch =
        prefixUnknown ||
        (!!prefixBase && pair.base === prefixBase && pair.variant === null)
      if (
        !prefixMatch &&
        !redactedMarker &&
        pair.base !== redactedVariantBase &&
        !sourcePairs.some((candidate) => same(candidate, pair))
      )
        continue
      if (style.context.parentRole) {
        if (!parentNode) continue
        if (parentNode.state !== 'resolved') contextUnknown = true
        else if (parentNode.role !== style.context.parentRole) continue
      }
      roles.add(style.role)
      if (prefixMatch) prefixPossible = true
    }
    const candidateRoles = [...roles].sort()
    const uncertain =
      !explicit || redacted || contextUnknown || prefixPossible || prefixUnknown
    const state: Resolution = !candidateRoles.length
      ? 'unmapped'
      : candidateRoles.length === 1 && !uncertain
        ? 'resolved'
        : 'ambiguous'
    const node: DraftRoleNode = {
      index: block.index,
      parentIndex: parent,
      kind: block.kind,
      container,
      headingLevel: block.headingLevel,
      state,
      role: state === 'resolved' ? candidateRoles[0] : null,
      candidateRoles,
      unmappedPossible:
        state !== 'resolved' && (uncertain || !candidateRoles.length),
      contextUnknown,
      requestSource: redacted
        ? 'redacted'
        : explicit
          ? 'explicit'
          : sourcePairs.length
            ? 'implicit'
            : 'unavailable',
      requested: block.selection.requested,
      applied: block.selection.applied,
      fallbacks: [...block.selection.fallbacks],
      inheritedCell: inherited
        ? {
            index: inherited.index,
            applied: inherited.selection.applied,
            fallbacks: [...inherited.selection.fallbacks],
          }
        : null,
      text: block.selection.text,
    }
    nodes.push(node)
    byIndex.set(block.index, node)
  }
  return nodes
}
