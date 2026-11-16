import { blockList } from '../blocks'
import { fixedBoundary } from '../fixedBoundary'
import { headingLevels, tableCandidates } from '../headings'
import { fixedMeta } from '../meta'
import { projectBlocks } from '../projectBlocks'
import { type Model, type ModelInput } from '../types'

import { type HierarchyFeature, extractFeature } from './features'

/** Preserve the v1 fixed-region boundary; hierarchy inference starts after it. */
export async function prepareHierarchy(input: ModelInput) {
  const blocks = await blockList(input),
    tables = tableCandidates(blocks)
  const { start } = fixedBoundary(blocks, input.structure.truncated)
  const body = blocks.slice(start),
    fixed = blocks.slice(1, start)
  const headings = headingLevels(
    tables.filter((t) => body.includes(t.block)),
    body[0]?.page ?? 0,
    [],
  )
  const boxes = headings.filter(
    (h) => h.block.table?.rows === 1 && h.block.table.cols === 1,
  )
  const projected = projectBlocks(input, body, boxes, new Map(), [])
  const features: HierarchyFeature[] = []
  for (const b of projected) {
    if (b.role === 'spacer' || b.role === 'omitted') continue
    const h = boxes.find((h) => h.block.ref === b.ref)
    if (b.table && !h) {
      features.push({ ...extractFeature(input.snapshot, b), object: 'table' })
      continue
    }
    if (b.omittedObjects.length)
      features.push({
        ...extractFeature(input.snapshot, b),
        ref: b.ref + '/object',
        object: 'picture',
      })
    if (!b.text.trim() && !h) continue
    const f = extractFeature(input.snapshot, b, h?.titleRef)
    f.titleCandidate = h?.role === 'H1'
    features.push(f)
  }
  const semantics = new Map(
    input.semantic.nodes
      .filter((n) => n.state === 'decided')
      .map((n) => [n.ref, n.candidates[0]?.role ?? '']),
  )
  const { meta, replacements } = fixedMeta(
    input.snapshot,
    fixed,
    input.texts,
    semantics,
  )
  const model: Model = {
    blocks: projected,
    fixedBlocks: fixed,
    facts: [],
    bodyStart: body[0]?.ref ?? null,
    body_source: null,
    bodyNeedsChoice: false,
    bodyCandidates: [],
    roles_dropped: [],
    semantic_unavailable: input.semanticUnavailable ?? null,
    bindings: [],
    meta,
    unclassified: [],
    omitted: [
      ...new Set(
        projected.flatMap((b) => [
          ...(b.role === 'omitted' ? [b.ref] : []),
          ...b.omittedObjects.map((o) => o.ref),
        ]),
      ),
    ],
    fixedRegions: fixed.length
      ? [
          {
            position: 'before_content',
            from_ref: fixed[0].ref,
            to_ref: fixed[fixed.length - 1].ref,
            replacements,
          },
        ]
      : [],
  }
  return { features, model }
}
