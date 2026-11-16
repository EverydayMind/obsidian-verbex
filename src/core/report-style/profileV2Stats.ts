import type { ToolArgs, ToolResult } from '../tools/localToolCommon'

import { computeProfileStats } from './computedStats'
import type { StyleApi } from './kordocStyleApi'
import type { ProfileV2 } from './profileV2'

/** Explicitly transient statistics; saved stats remain unavailable for snapshot/1. */
export async function readV2Stats(
  args: ToolArgs,
  machine: ProfileV2,
  noteSha256: string,
  api: () => StyleApi,
  path: string,
  signal?: AbortSignal,
  compact = false,
): Promise<ToolResult> {
  const profilePath = args.profile_path as string
  const computed = await computeProfileStats(
    machine,
    api,
    path,
    signal,
    compact,
  )
  if (computed.state === 'unavailable')
    return {
      kind: 'read',
      text: JSON.stringify({
        state: 'unavailable',
        reason: computed.reason,
        noteSha256,
      }),
      evidencePaths: [profilePath],
    }
  const { summary, inputsSha256, statsSha256 } = computed
  const offset = (args.offset as number | undefined) ?? 0,
    limit = (args.limit as number | undefined) ?? 20
  const expected = args.expected_stats_sha256 as string | undefined
  if ((offset > 0 || args.view === 'grammar_sequence') && !expected)
    throw new Error('Statistics pagination requires expected_stats_sha256.')
  if (expected && expected !== statsSha256)
    throw new Error('Statistics changed between pages.')
  let all: unknown[]
  if (args.view === 'text_statistics') all = summary.textConventions
  else if (args.view === 'grammar')
    all = summary.grammarObserved.map((entry) => ({
      ...entry,
      orderPatterns: entry.orderPatterns.map((pattern, patternIndex) => ({
        patternIndex,
        sequence: pattern.sequence.slice(0, 64),
        total: pattern.sequence.length,
        truncated: pattern.sequence.length > 64,
        count: pattern.count,
      })),
    }))
  else if (args.view === 'grammar_sequence') {
    const parentRole = args.parent_role as string,
      patternIndex = args.pattern_index as number
    const entry = summary.grammarObserved.find(
        (item) => item.parentRole === parentRole,
      ),
      pattern = entry?.orderPatterns[patternIndex]
    if (
      !pattern ||
      !Number.isInteger(patternIndex) ||
      patternIndex < 0 ||
      patternIndex > 2
    )
      throw new Error('Unknown grammar sequence.')
    all = pattern.sequence
  } else throw new Error('Unknown statistics view.')
  const items: unknown[] = []
  let bytes = 2
  for (const item of all.slice(offset, offset + limit)) {
    const size = new TextEncoder().encode(JSON.stringify(item)).byteLength + 1
    if (bytes + size > 56 * 1024) break
    bytes += size
    items.push(item)
  }
  if (!items.length && offset < all.length)
    throw new Error('A statistics item exceeds the page budget.')
  return {
    kind: 'read',
    text: JSON.stringify({
      state: 'available',
      statsState: 'computed_preview',
      featureBasis: summary.featureBasis,
      grammarPolicy: 'partial_known_leaf_roles',
      quantileRule: summary.quantileRule,
      coverage: summary.coverage,
      inputsSha256,
      statsSha256,
      noteSha256,
      ...(args.view === 'grammar_sequence'
        ? { parentRole: args.parent_role, patternIndex: args.pattern_index }
        : {}),
      items,
      total: all.length,
      nextOffset:
        offset + items.length < all.length ? offset + items.length : null,
    }),
    evidencePaths: [profilePath],
  }
}
