import { canonicalDigest } from '../../security/promptInjectionBoundary'

import {
  type RelationNode,
  buildRelations,
  cellRelationScope,
  numberingRelation,
} from './buildRelations'
import { type StyleApi } from './kordocStyleApi'
import type { RoleStyleVariant } from './profileV2'
import { type SemanticResult, readSemanticAnalysis } from './semanticRead'
import { STRUCTURAL_ROLES } from './semanticRoles'
import { styleMappingFacts } from './styleMappingFacts'
import type { ProfileMachine } from './types'

const headings = new Set([
  'DOCUMENT_TITLE',
  'SECTION_HEADING',
  'SUBSECTION_HEADING',
  'ITEM_HEADING',
])
const knownLeaf = new Set([
  'BODY_PARAGRAPH',
  'CAPTION',
  'FOOTNOTE',
  'SIGNATURE',
  'COVER',
  'EMPTY_SPACER',
])
const roles = new Set<string>(STRUCTURAL_ROLES)
const policy = 'partial-known-leaf-roles/0.1'

export type SemanticOverride = {
  ref: string
  role: string
  level?: number
  parent_ref?: string | null
  assignedBy?: 'model' | 'user'
}
export type StructureNode = {
  ref: string
  container: string
  role: string | null
  level: number | null
  semanticParentRef: string | null
  provenance: 'model' | 'user' | 'rule' | 'unresolved'
  ruleState: string
  childCount: number
  facts: string[]
}

/** Read-only preview: assignments belong to this request, not the stored profile. */
export async function readEffectiveStructure(input: {
  api: StyleApi
  path: string
  machine: ProfileMachine
  assignments: SemanticOverride[]
  persistedAssignments?: SemanticOverride[]
  analysis?: SemanticResult
  roleStyles?: RoleStyleVariant[]
  captureNodes?: (nodes: readonly StructureNode[]) => void
  expectedAnalysisSha256?: string
  expectedStructureSha256?: string
  offset: number
  limit: number
  signal?: AbortSignal
}) {
  const { api, path, machine, assignments, offset, limit, signal } = input
  if ((assignments.length || offset > 0) && !input.expectedAnalysisSha256)
    throw new Error(
      'Structure corrections and pagination require expected_analysis_sha256.',
    )
  if (offset > 0 && !input.expectedStructureSha256)
    throw new Error('Structure pagination requires expected_structure_sha256.')
  const analysis =
    input.analysis ??
    (await readSemanticAnalysis(
      api,
      path,
      machine.snapshot.source.sha256,
      machine.measurementSha256,
      signal,
    ))
  const relationVersion = [
    'ko-structure/0.8',
    'ko-structure/0.9',
    'ko-structure/0.10',
  ].includes(analysis.ruleSetVersion)
    ? 'shared-relations/0.3'
    : analysis.ruleSetVersion === 'ko-structure/0.7'
      ? 'shared-relations/0.2'
      : 'shared-relations/0.1'
  if (
    input.expectedAnalysisSha256 &&
    input.expectedAnalysisSha256 !== analysis.analysisSha256
  )
    throw new Error('Semantic analysis changed.')
  const positions = new Map(
    analysis.nodes.map((node, index) => [node.ref, index]),
  )
  const chosen = new Map<string, SemanticOverride>()
  const ephemeral = new Set<string>()
  for (const assignment of [
    ...(input.persistedAssignments ?? []),
    ...assignments,
  ]) {
    const position = positions.get(assignment.ref)
    const node = position === undefined ? undefined : analysis.nodes[position]
    const heading = headings.has(assignment.role)
    if (
      !node ||
      (chosen.has(assignment.ref) &&
        (!assignments.includes(assignment) || ephemeral.has(assignment.ref))) ||
      (!roles.has(assignment.role) &&
        !/^X-[A-Z][A-Z0-9_]{0,23}$/.test(assignment.role)) ||
      node.features.container === 'header' ||
      node.features.container === 'footer' ||
      (heading
        ? !Number.isInteger(assignment.level) ||
          (assignment.level ?? 0) < 1 ||
          (assignment.level ?? 0) > 9
        : assignment.level !== undefined) ||
      (Object.prototype.hasOwnProperty.call(assignment, 'parent_ref') &&
        assignment.parent_ref !== null &&
        (typeof assignment.parent_ref !== 'string' ||
          !positions.has(assignment.parent_ref) ||
          (positions.get(assignment.parent_ref) ?? Infinity) >=
            (position ?? -1)))
    )
      throw new Error('Invalid semantic correction.')
    chosen.set(assignment.ref, assignment)
    if (assignments.includes(assignment)) ephemeral.add(assignment.ref)
  }
  const ordered = [...chosen.values()].sort(
    (a, b) => (positions.get(a.ref) ?? 0) - (positions.get(b.ref) ?? 0),
  )
  const structureSha256 = await canonicalDigest({
    schema: 'report-style-structure-preview/1',
    relationVersion,
    policy,
    measurementSha256: machine.measurementSha256,
    analysisSha256: analysis.analysisSha256,
    assignments: ordered,
    ...(input.roleStyles
      ? { roleStylesSha256: await canonicalDigest(input.roleStyles) }
      : {}),
  })
  if (
    input.expectedStructureSha256 &&
    input.expectedStructureSha256 !== structureSha256
  )
    throw new Error('Semantic structure changed between pages.')
  let steps = 0
  const checkpoint = async () => {
    if (signal?.aborted) throw new Error('Semantic structure cancelled.')
    if (++steps % 256 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0))
    if (signal?.aborted) throw new Error('Semantic structure cancelled.')
  }
  const physicalNodes = new Map(
    machine.snapshot.nodes.map((node) => [node.ref, node]),
  )
  const base: RelationNode[] = analysis.nodes.map((node) => ({
    ref: node.ref,
    role: node.state === 'decided' ? (node.candidates[0]?.role ?? null) : null,
    level: node.level,
    container: node.features.container as string,
    indentPt: node.features.indentPt as number | null,
    prefixRank: node.features.prefixRank as number | null,
    ...([
      'ko-structure/0.7',
      'ko-structure/0.8',
      'ko-structure/0.9',
      'ko-structure/0.10',
    ].includes(analysis.ruleSetVersion)
      ? {
          numbering: numberingRelation(
            node.features.prefix,
            node.features.automaticMarker,
          ),
        }
      : {}),
    ...(['ko-structure/0.8', 'ko-structure/0.9', 'ko-structure/0.10'].includes(
      analysis.ruleSetVersion,
    ) && node.features.container === 'cell'
      ? { cellScope: cellRelationScope(node.ref, physicalNodes) }
      : {}),
  }))
  const originalParents = await buildRelations(base, checkpoint)
  if (
    analysis.nodes.some(
      (node, index) => node.semanticParentRef !== originalParents[index],
    )
  )
    throw new Error('Rule and effective relation algorithms differ.')
  const effective = base.map((node): RelationNode => {
    const assignment = chosen.get(node.ref)
    if (!assignment) return node
    return {
      ...node,
      role: assignment.role,
      level: assignment.level ?? null,
      ...(Object.prototype.hasOwnProperty.call(assignment, 'parent_ref')
        ? { fixedParentRef: assignment.parent_ref }
        : {}),
    }
  })
  const parents = chosen.size
    ? await buildRelations(effective, checkpoint)
    : originalParents
  const nodes: StructureNode[] = effective.map((node, index) => ({
    ref: node.ref,
    container: node.container,
    role: node.role,
    level: node.level,
    semanticParentRef: parents[index],
    provenance: chosen.has(node.ref)
      ? (chosen.get(node.ref)?.assignedBy ?? 'model')
      : node.role
        ? 'rule'
        : 'unresolved',
    ruleState: analysis.nodes[index].state,
    childCount: 0,
    facts: [],
  }))
  const byRef = new Map(nodes.map((node) => [node.ref, node]))
  for (const node of nodes) {
    await checkpoint()
    if (node.semanticParentRef !== null) {
      const parent = byRef.get(node.semanticParentRef)
      if (parent) parent.childCount++
    }
  }
  for (const node of nodes) {
    await checkpoint()
    const parent =
      node.semanticParentRef === null
        ? undefined
        : byRef.get(node.semanticParentRef)
    if (parent && !parent.role) node.facts.push('parent_unresolved')
    if (parent?.role && node.role && knownLeaf.has(parent.role))
      node.facts.push('parent_role_incompatible')
    if (
      parent?.role &&
      node.role &&
      headings.has(parent.role) &&
      headings.has(node.role) &&
      node.level !== null &&
      parent.level !== null &&
      node.level <= parent.level
    )
      node.facts.push('level_not_below_parent')
  }
  input.captureNodes?.(nodes)
  const items: StructureNode[] = []
  let bytes = 2
  for (const node of nodes.slice(offset, offset + limit)) {
    const size = new TextEncoder().encode(JSON.stringify(node)).length + 1
    if (bytes + size > 56 * 1024) break
    items.push(node)
    bytes += size
  }
  if (!items.length && offset < nodes.length)
    throw new Error('A structure node exceeds the page budget.')
  return {
    previewOnly: true,
    policy,
    relationVersion,
    analysisSha256: analysis.analysisSha256,
    structureSha256,
    total: nodes.length,
    items,
    nextOffset:
      offset + items.length < nodes.length ? offset + items.length : null,
    ...(input.roleStyles
      ? { styleMapping: styleMappingFacts(nodes, input.roleStyles) }
      : {}),
  }
}
