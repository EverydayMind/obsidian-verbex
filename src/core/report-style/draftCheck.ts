import type { App } from 'obsidian'

import { canonicalDigest } from '../../security/promptInjectionBoundary'
import type { ToolArgs, ToolResult } from '../tools/localToolCommon'

import { recheckBoundDraftInputs } from './draftInputs'
import { prepareInterpretedDraft } from './draftInterpretation'
import { compareDraftToStats } from './draftStatsComparison'
import {
  draftStructureCounts,
  strictTableGeometry,
} from './draftStructureCounts'
import { selectedTokenDiff } from './draftTokenDiff'
import type { ReportStylePorts } from './ports'

type Input = Parameters<typeof prepareInterpretedDraft>[2] & { limit?: number }

export async function executeDraftCheck(
  app: App,
  ports: ReportStylePorts,
  args: ToolArgs,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const profilePath = args.profile_path as string,
    draftPath = args.draft_path as string
  const result = await checkDraft(app, ports, {
    profilePath,
    draftPath,
    templatePath: args.template_path as string | undefined,
    baselinePath: args.baseline_path as string | undefined,
    expectedDraftSha256: args.expected_draft_sha256 as string | undefined,
    expectedInputsDigest: args.expected_inputs_digest as string | undefined,
    offset: args.offset as number | undefined,
    limit: args.limit as number | undefined,
    signal,
  })
  const text = JSON.stringify(result)
  if (new TextEncoder().encode(text).byteLength > 128 * 1024)
    throw new Error(
      'Report style result exceeds 128 KiB; request a smaller page.',
    )
  return {
    kind: 'read',
    text,
    evidencePaths: [
      profilePath,
      draftPath,
      ...(result.state === 'available'
        ? [result.templatePath]
        : typeof args.template_path === 'string'
          ? [args.template_path]
          : []),
      ...(typeof args.baseline_path === 'string' ? [args.baseline_path] : []),
    ],
  }
}

/** Facts only: no draft text, guidance, or profile machine is returned. */
export async function checkDraft(
  app: App,
  ports: ReportStylePorts,
  input: Input,
) {
  const offset = input.offset ?? 0,
    limit = input.limit ?? 20
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (offset > 0 && !input.expectedInputsDigest) ||
    (input.expectedInputsDigest !== undefined &&
      !/^[a-f0-9]{64}$/.test(input.expectedInputsDigest))
  )
    throw new Error('Invalid draft check pagination or digest.')
  // The final digest binds both the four source inputs and the recomputed statistics.
  const prepared = await prepareInterpretedDraft(app, ports, {
    ...input,
    offset: 0,
    expectedInputsDigest: undefined,
  })
  if (prepared.state !== 'available') return prepared
  input.signal?.throwIfAborted()
  const tokenDiff =
    prepared.baselineText === null
      ? { state: 'not_requested' as const }
      : selectedTokenDiff(prepared.baselineText, prepared.draftText)
  const statistics = prepared.statistics
  const statsBinding =
    statistics.state === 'available'
      ? { state: statistics.state, statsSha256: statistics.statsSha256 }
      : { state: statistics.state, reason: statistics.reason }
  const inputsDigest = await canonicalDigest({
    version: 'report-style-draft-check/0.1',
    draftInputsDigest: prepared.inputsDigest,
    statistics: statsBinding,
    tokenDiff: tokenDiff.state,
    tokenDiffVersion: 'selected-token-diff/0.1',
  })
  const checked = await recheckBoundDraftInputs(app, input, prepared)
  if (!checked.unchanged)
    return {
      state: 'input_changed' as const,
      before: prepared.before,
      after: checked.after,
    }
  if (input.expectedInputsDigest && input.expectedInputsDigest !== inputsDigest)
    return {
      state: 'input_changed' as const,
      before: prepared.before,
      after: null,
    }
  const roleFacts =
    prepared.interpretation.state === 'available'
      ? prepared.interpretation.nodes.map((node) => ({
          kind: 'block_role' as const,
          index: node.index,
          parentIndex: node.parentIndex,
          state: node.state,
          role: node.role,
          candidateRoles: node.candidateRoles,
          unmappedPossible: node.unmappedPossible,
          contextUnknown: node.contextUnknown,
          requested: node.requested,
          applied: node.applied,
          textSemantics: node.text.semantics ?? null,
          fallbacks: node.fallbacks,
          inheritedCell: node.inheritedCell,
        }))
      : []
  const unclassifiedTextFacts =
    prepared.interpretation.state === 'available'
      ? []
      : prepared.observed.blocks.flatMap((block) =>
          block.selection.text.semantics
            ? [
                {
                  kind: 'unclassified_text_semantics' as const,
                  index: block.index,
                  textSemantics: block.selection.text.semantics,
                },
              ]
            : [],
        )
  const draftEvidence =
    statistics.state === 'available'
      ? null
      : prepared.interpretation.state === 'available'
        ? compareDraftToStats(prepared.interpretation.nodes, null)
        : null
  const comparisonFacts =
    statistics.state === 'available'
      ? statistics.facts
      : draftEvidence?.state === 'available'
        ? draftEvidence.facts
        : []
  const tokenFacts = tokenDiff.state === 'available' ? tokenDiff.facts : []
  const facts = [
    ...roleFacts,
    ...unclassifiedTextFacts,
    ...comparisonFacts,
    ...tokenFacts,
  ]
  const factKinds: Record<string, number> = {}
  for (const fact of facts)
    factKinds[fact.kind] = (factKinds[fact.kind] ?? 0) + 1
  const items: typeof facts = []
  let itemBytes = 0
  for (const fact of facts.slice(offset, offset + limit)) {
    const size = new TextEncoder().encode(JSON.stringify(fact)).byteLength
    if (itemBytes + size > 65536 && items.length) break
    if (size > 65536) throw new Error('Draft check item exceeds size limit.')
    items.push(fact)
    itemBytes += size
  }
  const nextOffset =
    offset + items.length < facts.length ? offset + items.length : null
  const linked = prepared.profile.template
  const matchesLinked =
    linked &&
    linked.path === prepared.observed.inputDependencies[1].path &&
    linked.sha256 === prepared.before.template
  const templateDerivation = !matchesLinked
    ? 'unknown'
    : prepared.profile.schema === 'report-style-profile/1'
      ? 'v1'
      : prepared.profile.template?.derivationSchema ===
          'report-style-derivation/2'
        ? 'v2'
        : 'v1'
  return {
    state: 'available' as const,
    inputsDigest,
    draftSha256: prepared.before.draft,
    coverage: prepared.observed.coverage,
    templatePath: prepared.observed.inputDependencies[1].path,
    templateDerivation,
    structureCounts: draftStructureCounts(
      prepared.profile.snapshot,
      prepared.observed.blocks,
    ),
    ...(prepared.profile.schema === 'report-style-profile/2' &&
    prepared.profile.fidelity.structural === 'strict'
      ? {
          strictTableGeometry: strictTableGeometry(
            prepared.profile.snapshot,
            prepared.observed.blocks,
          ),
        }
      : {}),
    structuralFidelity:
      prepared.profile.schema === 'report-style-profile/2'
        ? {
            state: 'preference' as const,
            value: prepared.profile.fidelity.structural,
            compliance: 'not_evaluated' as const,
          }
        : { state: 'unavailable' as const, reason: 'profile_v1' as const },
    interpretation:
      prepared.interpretation.state === 'available'
        ? {
            state: 'available' as const,
            counts: prepared.interpretation.counts,
          }
        : prepared.interpretation,
    statistics:
      statistics.state === 'available'
        ? {
            state: statistics.state,
            statsState: statistics.statsState,
            statsSha256: statistics.statsSha256,
            coverage: statistics.coverage,
            roleCounts: statistics.roleCounts,
            endingDistributions: statistics.endingDistributions,
            phraseCandidateDistributions:
              statistics.phraseCandidateDistributions,
            unsupported: statistics.unsupported,
          }
        : statistics,
    draftEvidence:
      draftEvidence?.state === 'available'
        ? {
            state: 'available' as const,
            coverage: draftEvidence.coverage,
            phraseCandidateDistributions:
              draftEvidence.phraseCandidateDistributions,
            unsupported: draftEvidence.unsupported,
          }
        : (draftEvidence ??
          (statistics.state === 'available'
            ? { state: 'included_in_statistics' as const }
            : {
                state: 'unavailable' as const,
                reason: 'role_interpretation_unavailable' as const,
              })),
    tokenDiff:
      tokenDiff.state === 'available'
        ? {
            state: tokenDiff.state,
            version: tokenDiff.version,
            basis: tokenDiff.basis,
            limitation: tokenDiff.limitation,
            totalFacts: tokenFacts.length,
          }
        : tokenDiff,
    totalFacts: facts.length,
    factKinds,
    counts: {
      blockRoles: roleFacts.length,
      unclassifiedText: unclassifiedTextFacts.length,
      comparison: comparisonFacts.length,
      tokenDiff: tokenFacts.length,
    },
    offset,
    nextOffset,
    truncated: nextOffset !== null,
    items,
  }
}
