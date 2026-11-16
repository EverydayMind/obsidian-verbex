import { noteFormatLocale } from '../../i18n/noteFormats'
import { copyJson } from '../../provider/interop/descriptorReader'
import { canonicalDigest } from '../../security/promptInjectionBoundary'
import {
  type ToolArgs,
  type ToolResult,
  changeHelper,
} from '../tools/localToolCommon'

import { renderCompactProfileV2Note } from './compactProfileNote'
import { measureCompactSemantic } from './compactSemanticApi'
import {
  type SemanticOverride,
  readEffectiveStructure,
} from './effectiveStructure'
import type { StyleApi } from './kordocStyleApi'
import { renderProfileV2Note } from './note'
import { operationArgumentProblem } from './operationArgs'
import { profileOverlapNotes } from './overlapAdvisory'
import type { ReportStylePorts } from './ports'
import {
  type ProfileV2,
  type SemanticAssignment,
  setModelSemantics,
  upgradeSnapshotV1,
  validateExpandedProfileV2,
  validateProfileV2,
} from './profileV2'
import { linkV2 } from './profileV2Link'
import { refreshV2 } from './profileV2Refresh'
import { type RoleStyleInput, setModelRoleStyles } from './profileV2Styles'
import {
  type TextOverrideInput,
  setModelTextProfile,
  setStructuralFidelity,
} from './profileV2Text'
import { readProfileSemanticAnalysis } from './savedSemanticAnalysis'
import { validateStyleJson } from './schema'
import { persistedSemanticOverrides } from './semanticOverrides'
import { readSemanticPage } from './semanticRead'
import type { SemanticReplay } from './semanticReplay'
import type { FixedRegion, ProfileMachine, StyleSnapshot } from './types'

export type SavedNote<T> = {
  machine: T
  guidance: string
  newline: string
  text: string
  noteSha256: string
  compact?: boolean
}

export async function updateV2(
  args: ToolArgs,
  note: SavedNote<ProfileMachine | ProfileV2>,
  byteHash: (path: string) => Promise<string>,
  ports: ReportStylePorts,
  api: () => StyleApi,
  path: (path: string) => string,
  signal?: AbortSignal,
): Promise<ToolResult> {
  if (
    note.noteSha256 !== args.expected_note_sha256 ||
    note.machine.revision !== args.expected_revision
  )
    throw new Error('Profile note/revision changed.')
  const operation = args.operation as string
  const allowed: Record<string, string[]> = {
    upgrade_schema: [],
    set_semantics: ['semantics'],
    set_role_styles: ['role_styles'],
    set_guidance: ['guidance'],
    link_template: [
      'template_path',
      'expected_template_sha256',
      'expected_derivation_sha256',
    ],
    refresh_measurement: [],
    capture_semantic_evidence: [],
    set_text_profile: ['text_overrides'],
    set_fidelity: ['structural_fidelity'],
  }
  const fields = allowed[operation]
  const optional =
    operation === 'set_semantics'
      ? ['remove_semantic_refs']
      : operation === 'set_role_styles'
        ? ['remove_role_style_indices', 'fixed_regions']
        : []
  const problem = operationArgumentProblem(operation, args, fields, optional)
  if (problem) throw new Error(problem)
  let machine: ProfileV2
  if (operation === 'upgrade_schema') {
    if (note.machine.schema !== 'report-style-profile/1')
      throw new Error('Only a v1 profile can be upgraded.')
    machine = (await upgradeSnapshotV1(note.machine, note.compact)).profile
  } else {
    if (note.machine.schema !== 'report-style-profile/2')
      throw new Error('Upgrade the profile before setting semantics.')
    machine = note.machine
    if (operation === 'set_semantics')
      machine = await setModelSemantics(
        machine,
        args.semantics as Omit<SemanticAssignment, 'assignedBy'>[],
        (args.remove_semantic_refs as string[] | undefined) ?? [],
        note.compact,
      )
    if (operation === 'link_template')
      machine = await linkV2(machine, args, byteHash, ports, signal)
    if (operation === 'set_role_styles')
      machine = await setModelRoleStyles(
        machine,
        args.role_styles as RoleStyleInput[],
        ports,
        signal,
        (args.remove_role_style_indices as number[] | undefined) ?? [],
        (args.fixed_regions as FixedRegion[] | undefined) ??
          machine.fixedRegions,
        note.compact,
      )
    if (operation === 'set_text_profile')
      machine = await setModelTextProfile(
        machine,
        args.text_overrides as TextOverrideInput[],
        note.compact,
      )
    if (operation === 'set_fidelity')
      machine = await setStructuralFidelity(
        machine,
        args.structural_fidelity as ProfileV2['fidelity']['structural'],
        note.compact,
      )
    if (operation === 'refresh_measurement')
      machine = await refreshV2(
        machine,
        api(),
        path(machine.sourcePath),
        signal,
        note.compact ? { byteHash } : undefined,
      )
    if (operation === 'capture_semantic_evidence') {
      const styleApi = api()
      if (note.compact) {
        const measured = await measureCompactSemantic(
          styleApi,
          path(machine.sourcePath),
          machine.snapshot.source.sha256,
          signal,
        )
        if (measured.measurementSha256 !== machine.measurementSha256)
          throw new Error('Semantic evidence measurement mismatch.')
        machine = await validateExpandedProfileV2({
          ...machine,
          semanticReplay: measured.semanticReplay,
        })
      } else {
        if (!styleApi.extractSemanticEvidence)
          throw new Error('KORDOC semantic evidence unavailable.')
        const sourcePath = path(machine.sourcePath)
        const response = copyJson(
          await styleApi.extractSemanticEvidence({
            path: sourcePath,
            expectedSha256: machine.snapshot.source.sha256,
            signal,
          }),
          {
            maxDepth: 32,
            maxNodes: 1500000,
            maxBytes: 16 * 1024 * 1024,
          },
        ) as Record<string, unknown>
        if (signal?.aborted)
          throw new Error('Report style operation cancelled.')
        if (response.status !== 'ok' || response.sourcePath !== sourcePath)
          throw new Error('Semantic evidence unavailable or source changed.')
        const snapshot = validateStyleJson<StyleSnapshot>(
          'snapshot',
          response.snapshot,
        )
        if (
          snapshot.source.sha256 !== machine.snapshot.source.sha256 ||
          response.measurementSha256 !== machine.measurementSha256 ||
          (await canonicalDigest(snapshot)) !== machine.measurementSha256
        )
          throw new Error('Semantic evidence measurement mismatch.')
        machine = await validateProfileV2({
          ...machine,
          semanticReplay: {
            evidence: response.evidence,
            evidenceSha256: response.evidenceSha256,
          } as SemanticReplay,
        })
      }
    }
  }
  machine = {
    ...machine,
    revision: machine.revision + 1,
    updated: new Date().toISOString(),
  }
  const guidance =
    operation === 'set_guidance' ? (args.guidance as string) : note.guidance
  const after = await (note.compact
    ? renderCompactProfileV2Note(
        machine,
        guidance,
        note.newline,
        noteFormatLocale(note.text),
      )
    : renderProfileV2Note(
        machine,
        guidance,
        note.newline,
        noteFormatLocale(note.text),
      ))
  const approvalNotes = await profileOverlapNotes({
    args,
    machine,
    api,
    path,
    signal,
  })
  if (signal?.aborted) throw new Error('Report style operation cancelled.')
  return changeHelper('update_style_profile', {
    op: 'modify',
    kind: 'body',
    path: args.profile_path as string,
    before: note.text,
    after,
    approvalMode: 'whole_change',
    approvalNotes,
    binarySourceDependencies:
      operation === 'refresh_measurement' ||
      operation === 'capture_semantic_evidence'
        ? [
            {
              path: path(machine.sourcePath),
              sha256Before: machine.snapshot.source.sha256,
            },
          ]
        : operation === 'link_template' && machine.template
          ? [
              {
                path: machine.template.path,
                sha256Before: machine.template.sha256,
              },
            ]
          : [],
  })
}

export function readV2(args: ToolArgs, note: SavedNote<ProfileV2>): ToolResult {
  const machine = note.machine,
    view = args.view ?? 'summary'
  let value: unknown
  if (view === 'summary')
    value = {
      schema: machine.schema,
      title: machine.title,
      revision: machine.revision,
      sourceSha256: machine.snapshot.source.sha256,
      measurementSha256: machine.measurementSha256,
      semanticsSha256: machine.semanticsSha256,
      assignments: machine.semantics.length,
      roleStyles: machine.roleStyleMap.length,
      analysis: machine.analysis,
      semanticReplay: machine.semanticReplay
        ? {
            state: 'available',
            evidenceSha256: machine.semanticReplay.evidenceSha256,
            ruleSetVersion: machine.semanticReplay.evidence.ruleSetVersion,
          }
        : { state: 'unavailable' },
      stats: machine.stats,
      fidelity: machine.fidelity,
      template: machine.template,
      noteSha256: note.noteSha256,
      nameFieldsMayContainText: true,
    }
  else if (view === 'guidance')
    value = { guidance: note.guidance, noteSha256: note.noteSha256 }
  else if (view === 'text_profile') {
    const offset = (args.offset as number | undefined) ?? 0,
      limit = (args.limit as number | undefined) ?? 20
    if (
      (offset > 0 || args.expected_note_sha256 !== undefined) &&
      args.expected_note_sha256 !== note.noteSha256
    )
      throw new Error('Profile note changed or pagination digest missing.')
    const items = machine.textProfile.overrides.slice(offset, offset + limit),
      end = offset + items.length
    value = {
      items,
      total: machine.textProfile.overrides.length,
      nextOffset: end < machine.textProfile.overrides.length ? end : null,
      stats: machine.stats,
      noteSha256: note.noteSha256,
    }
  } else if (view === 'text_features') {
    const saved = machine.semanticReplay
    if (
      !saved ||
      saved.evidence.schema === 'report-style-semantic-evidence/0.1'
    )
      value = {
        state: 'unavailable',
        reason: 'text_features_not_captured',
        noteSha256: note.noteSha256,
      }
    else {
      const offset = (args.offset as number | undefined) ?? 0,
        limit = (args.limit as number | undefined) ?? 20
      if (
        (offset > 0 || args.expected_note_sha256 !== undefined) &&
        args.expected_note_sha256 !== note.noteSha256
      )
        throw new Error('Profile note changed or pagination digest missing.')
      const items = saved.evidence.nodes
          .slice(offset, offset + limit)
          .map((node) => ({
            ref: node.ref,
            ...node.textFeatures,
            ...(node.automaticMarker
              ? { automaticMarker: node.automaticMarker }
              : {}),
            ...(node.scriptRuns
              ? {
                  scriptRunCounts: node.scriptRuns.reduce(
                    (counts, state) => {
                      counts[state]++
                      return counts
                    },
                    { normal: 0, superscript: 0, subscript: 0, unknown: 0 },
                  ),
                }
              : {}),
          })),
        end = offset + items.length
      value = {
        state: 'available',
        basis: 'rule_estimate',
        version: saved.evidence.textFeaturesVersion,
        evidenceSha256: saved.evidenceSha256,
        noteSha256: note.noteSha256,
        items,
        total: saved.evidence.nodes.length,
        nextOffset: end < saved.evidence.nodes.length ? end : null,
        pageNumberControls: saved.evidence.pageNumberControls
          ? {
              state: 'available',
              basis: 'source_observation',
              items: machine.snapshot.sections
                .slice(offset, offset + limit)
                .map((section) => ({
                  sectionRef: section.ref,
                  ...saved.evidence.pageNumberControls?.[section.ref],
                })),
              total: machine.snapshot.sections.length,
              nextOffset:
                offset + limit < machine.snapshot.sections.length
                  ? offset + limit
                  : null,
            }
          : { state: 'unavailable', reason: 'not_captured' },
      }
    }
  } else if (view === 'bindings') {
    const offset = (args.offset as number | undefined) ?? 0,
      limit = (args.limit as number | undefined) ?? 50
    if (
      (offset > 0 || args.expected_note_sha256 !== undefined) &&
      args.expected_note_sha256 !== note.noteSha256
    )
      throw new Error('Profile note changed or pagination digest missing.')
    const all = [
      ...machine.roleStyleMap.map((style, index) => ({
        kind: 'role_style' as const,
        index,
        ...style,
        legacyUnverified: style.legacy !== undefined,
      })),
      ...machine.fixedRegions.map((region) => ({
        kind: 'fixed_region' as const,
        ...region,
      })),
    ]
    const items = all.slice(offset, offset + limit),
      end = offset + items.length
    value = {
      noteSha256: note.noteSha256,
      total: all.length,
      offset,
      items,
      nextOffset: end < all.length ? end : null,
      truncated: end < all.length,
      nameFieldsMayContainText: true,
    }
  } else if (view === 'assignments') {
    const offset = (args.offset as number | undefined) ?? 0,
      limit = (args.limit as number | undefined) ?? 50
    if (
      (offset > 0 || args.expected_semantics_sha256 !== undefined) &&
      args.expected_semantics_sha256 !== machine.semanticsSha256
    )
      throw new Error(
        'Semantic assignments changed or pagination digest missing.',
      )
    const items = machine.semantics.slice(offset, offset + limit),
      end = offset + items.length
    value = {
      semanticsSha256: machine.semanticsSha256,
      total: machine.semantics.length,
      offset,
      items,
      nextOffset: end < machine.semantics.length ? end : null,
      truncated: end < machine.semantics.length,
      analysis: machine.analysis,
    }
  } else
    throw new Error(
      'This view is not yet available for snapshot-v1 profiles upgraded to v2.',
    )
  return {
    kind: 'read',
    text: JSON.stringify(value),
    evidencePaths: [args.profile_path as string],
  }
}

export async function readV2Semantic(
  args: ToolArgs,
  note: SavedNote<ProfileV2>,
  api: StyleApi,
  path: string,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const saved = note.machine.semanticReplay
  if (!saved) throw new Error('Saved semantic evidence unavailable.')
  const analysis = await readProfileSemanticAnalysis(
    api,
    note.machine.snapshot,
    note.machine.measurementSha256,
    saved,
    signal,
    note.compact,
  )
  const page = await readSemanticPage({
    api,
    path,
    sourceSha256: note.machine.snapshot.source.sha256,
    measurementSha256: note.machine.measurementSha256,
    offset: (args.offset as number | undefined) ?? 0,
    limit: (args.limit as number | undefined) ?? 20,
    expectedAnalysisSha256: args.expected_analysis_sha256 as string | undefined,
    includePreviews: args.include_source_previews !== false,
    ambiguousOnly: args.view === 'ambiguous',
    analysis,
    signal,
  })
  const hasPreview =
    page.preview &&
    typeof page.preview === 'object' &&
    'status' in page.preview &&
    page.preview.status === 'ok'
  return {
    kind: 'read',
    text: JSON.stringify({
      ...page,
      noteSha256: note.noteSha256,
      revision: note.machine.revision,
      profileRevisionSha256: await canonicalDigest(note.machine),
      analysisSource: 'saved_evidence',
      evidenceSha256: saved.evidenceSha256,
    }),
    evidencePaths: hasPreview
      ? [args.profile_path as string, note.machine.sourcePath]
      : [args.profile_path as string],
  }
}

/** Saved evidence is replayed locally; otherwise the source is analyzed live. */
export async function readV2Structure(
  args: ToolArgs,
  note: SavedNote<ProfileV2>,
  api: StyleApi,
  path: string,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const offset = (args.offset as number | undefined) ?? 0
  if (
    (offset > 0 || args.expected_semantics_sha256 !== undefined) &&
    args.expected_semantics_sha256 !== note.machine.semanticsSha256
  )
    throw new Error(
      'Semantic assignments changed or pagination digest missing.',
    )
  const persistedAssignments = persistedSemanticOverrides(note.machine)
  const saved = note.machine.semanticReplay
  const analysis = saved
    ? await readProfileSemanticAnalysis(
        api,
        note.machine.snapshot,
        note.machine.measurementSha256,
        saved,
        signal,
        note.compact,
      )
    : undefined
  const page = await readEffectiveStructure({
    api,
    path,
    machine: note.machine as unknown as ProfileMachine,
    analysis,
    roleStyles: note.machine.roleStyleMap,
    assignments:
      (args.semantic_assignments as SemanticOverride[] | undefined) ?? [],
    persistedAssignments,
    expectedAnalysisSha256: args.expected_analysis_sha256 as string | undefined,
    expectedStructureSha256: args.expected_structure_sha256 as
      | string
      | undefined,
    offset,
    limit: (args.limit as number | undefined) ?? 20,
    signal,
  })
  return {
    kind: 'read',
    text: JSON.stringify({
      ...page,
      revision: note.machine.revision,
      noteSha256: note.noteSha256,
      profileRevisionSha256: await canonicalDigest(note.machine),
      semanticsSha256: note.machine.semanticsSha256,
      analysisSource: saved ? 'saved_evidence' : 'source_reanalysis',
      ...(saved ? { evidenceSha256: saved.evidenceSha256 } : {}),
      assignmentsSource: 'persisted_with_optional_preview',
    }),
    evidencePaths: saved
      ? [args.profile_path as string]
      : [args.profile_path as string, note.machine.sourcePath],
  }
}
