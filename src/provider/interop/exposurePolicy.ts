export { nativeProviderNotes } from './nativeProviderNotes'
import { allocateNativeGroups } from './exposureAllocation'
import { nativeExposureGroups } from './exposureGroups'
import { requestScore } from './exposureRanking'
import { availableExposureReasons } from './exposureReasons'
import type { SkillReservation } from './exposureReservations'
import type { NativeToolEntry } from './NativeProviderHost'
import { NativeTurnScope } from './turnScope'

export const MAX_NATIVE_DEFINITION_TOKENS = 8000
export type NativeExposure = {
  text: string
  simple: boolean
  skillTools: readonly string[]
  pinnedTools: readonly string[]
  excludedTools: readonly string[]
  /** Paths the turn is about: the active file and mentioned files. */
  resourcePaths: readonly string[]
  /** Current targets; historical paths remain discovery-only when these exist. */
  preferredResourcePaths?: readonly string[]
  requestText?: string
  priorUserText?: string
  assistantChoiceText?: string
  turnScope?: NativeTurnScope
  turnResourcePaths?: readonly string[]
  contextProviders?: readonly string[]
  /** Fenced code block languages in the turn's current Markdown note. */
  codeBlockLanguages?: readonly string[]
  /** Active Skills' `preferred-tools`, in active order (WP8(a)). */
  reservations?: readonly SkillReservation[]
  /** B4: leave out optional groups the current request does not match. */
  demoteUnmatchedOptional?: boolean
}

/**
 * Model-visible notes for the exposed providers: the instructions the user
 * approved, labelled with their origin, and the paths of this turn that match
 * the provider's resource types. Paths are metadata; no document text is added.
 * The submitted editor scope adds its metadata to the provider it came from.
 */

/**
 * Deterministic per-turn selection. The core group of a provider is exposed
 * whole or not at all, so the model never sees half of a read-then-act flow.
 * Reasons: a Skill or workflow requires one of its tools, the files of the
 * turn match its resource types, or the user pinned one of its tools.
 */
export async function selectNativeTools(
  entries: readonly NativeToolEntry[],
  policy: NativeExposure,
) {
  const groups = nativeExposureGroups(entries, policy)
  const allocation = await allocateNativeGroups(
    groups,
    MAX_NATIVE_DEFINITION_TOKENS,
    {
      reservations: policy.reservations ?? [],
      entries,
      excluded: (name) =>
        policy.excludedTools.includes(name) &&
        !policy.skillTools.includes(name),
      requestScore: (tools) => requestScore(tools, policy),
      providerRequestScore: (tools) =>
        requestScore(tools, {
          ...policy,
          requestText: policy.requestText ?? '',
        }),
      skipOptional: policy.demoteUnmatchedOptional
        ? (tools) =>
            requestScore(tools, {
              ...policy,
              requestText: policy.requestText ?? '',
            }) === 0
        : undefined,
    },
  )
  return {
    ...allocation,
    automaticProviderIds: groups
      .filter((group) => group.rank === 2)
      .map((group) => group.id),
    availableReasons: availableExposureReasons(
      entries,
      policy,
      allocation.definitions.map((tool) => tool.function.name),
      allocation.attempts,
    ),
    demotions: groups.map(({ id, demotion }) => ({
      providerId: id,
      ...demotion,
    })),
  }
}
