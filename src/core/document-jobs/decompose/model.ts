import { blockList } from './blocks'
import { bodyRoles } from './bodyRoles'
import { fixedBoundary } from './fixedBoundary'
import { headingLevels, tableCandidates } from './headings'
import { fixedMeta } from './meta'
import { paragraphHeadings } from './paragraphHeadings'
import { fitPlainVariants } from './plainVariants'
import { projectBlocks } from './projectBlocks'
import { spacingBindings } from './spacing'
import { type Fact, type Model, type ModelInput, RULES } from './types'

export async function buildStructureModel(input: ModelInput): Promise<Model> {
  if (input.semanticUnavailable) input = { ...input, semantic: { nodes: [] } }
  const blocks = await blockList(input)
  const facts: Fact[] = []
  if (input.semanticUnavailable)
    facts.push({
      step: 6,
      rule: 'semantic_unavailable',
      refs: [],
      value: input.semanticUnavailable,
    })
  for (const b of blocks)
    facts.push({
      step: 1,
      rule: 'explicit_page_interval',
      refs: [b.ref],
      value: b.page,
    })
  const tables = tableCandidates(blocks)
  facts.push({
    step: 2,
    rule: 'counter_from_structure',
    refs: tables.map((t) => t.block.table?.ref ?? t.block.ref),
  })
  const { start, trigger, sizeOK } = fixedBoundary(
    blocks,
    input.structure.truncated,
  )
  facts.push({
    step: 3,
    rule: input.structure.truncated
      ? 'truncated_all_body'
      : sizeOK
        ? 'first_trigger_page'
        : 'front_size_exceeded',
    refs: blocks[start] ? [blocks[start].ref] : [],
    value: trigger?.ref ?? null,
  })
  const fixed = blocks.slice(1, start)
  facts.push({
    step: 4,
    rule: 'front_after_section_first',
    refs: fixed.map((b) => b.ref),
  })
  const body = blocks.slice(start)
  const heading = headingLevels(
    tables.filter((t) => body.includes(t.block)),
    body[0]?.page ?? 0,
    facts,
  )
  heading.push(...paragraphHeadings(input.snapshot, body, heading, facts))
  const roleResult = bodyRoles(
    input.snapshot,
    body,
    input.baseFontPt ?? RULES.baseFontPt,
    facts,
  )
  const bindings = [...roleResult.bindings]
  const projections = projectBlocks(
    input,
    body,
    heading,
    roleResult.roles,
    bindings,
  )
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
  facts.push({
    step: 7,
    rule: 'fixed_meta',
    refs: replacements.map((r) => r.paragraphRef),
    value: replacements,
  })
  const unclassified = projections
    .filter((b) => b.role === 'unclassified')
    .map((b) => b.ref)
  const omitted = [
    ...new Set(
      projections.flatMap((b) => [
        ...(b.role === 'omitted' ? [b.ref] : []),
        ...b.omittedObjects.map((o) => o.ref),
      ]),
    ),
  ]
  for (const b of projections)
    facts.push({
      step: /^H\d+$/.test(b.role)
        ? 5
        : ['unclassified', 'omitted', 'spacer'].includes(b.role)
          ? 8
          : 6,
      rule: 'resolved_block_role',
      refs: [b.ref],
      value: { role: b.role, representativeRef: b.representativeRef },
    })
  facts.push(
    { step: 8, rule: 'unclassified', refs: unclassified },
    { step: 8, rule: 'omitted', refs: omitted },
  )
  bindings.push(
    ...spacingBindings(roleResult.scoped, projections, bindings, facts),
  )
  facts.push({
    step: 6,
    rule: 'resolved_role_spacing',
    refs: bindings
      .filter((b) => b.marker.startsWith('SPACE:'))
      .map((b) => b.representativeRef),
    value: bindings.filter((b) => b.marker.startsWith('SPACE:')),
  })
  return fitPlainVariants(
    {
      blocks: projections,
      fixedBlocks: fixed,
      facts: facts.sort((a, b) => a.step - b.step),
      bodyStart: blocks[start]?.ref ?? null,
      body_source: roleResult.body_source,
      bodyNeedsChoice: roleResult.bodyNeedsChoice,
      bodyCandidates: roleResult.bodyCandidates,
      roles_dropped: [],
      semantic_unavailable: input.semanticUnavailable ?? null,
      bindings,
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
      meta,
      unclassified,
      omitted,
    },
    roleResult.scoped,
  )
}
