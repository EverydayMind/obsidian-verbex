import type { RequestTool } from '../../types/llm/request'
import { toolDefinitionTokenCount } from '../toolDefinitionTokenCount'

import type { nativeExposureGroups } from './exposureGroups'
import type {
  ReservationOutcome,
  SkillReservation,
} from './exposureReservations'
import type { NativeToolEntry } from './NativeProviderHost'

type Stage = 'explicit' | 'core' | 'reservation' | 'optional' | 'other'
export type AllocationAttempt = {
  stage: Stage
  providerId: string
  tools: string[]
  result: 'added' | 'budget' | 'skipped'
  blockedBy?: { providerId: string; stage: Stage }
}

/** Ephemeral allocation facts; recording and privacy filtering belong to the diagnostic layer. */
export async function allocateNativeGroups(
  groups: ReturnType<typeof nativeExposureGroups>,
  budget: number,
  reserve?: {
    reservations: readonly SkillReservation[]
    entries: readonly NativeToolEntry[]
    excluded: (name: string) => boolean
    /** WP8(b): current-request score of an optional group. */
    requestScore?: (tools: NativeToolEntry[]) => number
    providerRequestScore?: (tools: NativeToolEntry[]) => number
  },
) {
  const definitions: RequestTool[] = []
  const attempts: AllocationAttempt[] = []
  const missingExplicit: string[] = []
  const reservations: ReservationOutcome[] = []
  const added = new Set<string>()
  let tokens = 0
  let omitted = 0
  const optional: { providerId: string; tools: NativeToolEntry[] }[] = []
  const add = async (
    providerId: string,
    tools: NativeToolEntry[],
    stage: Stage,
    required = false,
  ) => {
    // Every stage de-duplicates by name; an admitted tool costs nothing again.
    const fresh = [
      ...new Map(
        tools
          .filter((entry) => !added.has(entry.name))
          .map((entry) => [entry.name, entry]),
      ).values(),
    ]
    let cost = 0
    for (const entry of fresh)
      cost += await toolDefinitionTokenCount(entry.definition)
    const names = tools.map((entry) => entry.name)
    if (tokens + cost > budget) {
      if (required) missingExplicit.push(...names)
      omitted += fresh.length
      attempts.push({ providerId, stage, tools: names, result: 'budget' })
      return false
    }
    tokens += cost
    definitions.push(...fresh.map((entry) => entry.definition))
    for (const entry of fresh) added.add(entry.name)
    attempts.push({ providerId, stage, tools: names, result: 'added' })
    return true
  }
  // WP8(a): a Skill reservation is atomic only here; later stages may still
  // expose part of a failed one. It never stops the request.
  const reserveSkill = async (reservation: SkillReservation) => {
    const entries = reserve?.entries ?? []
    const declared = reservation.tools.map((name) =>
      entries.find((entry) => entry.name === name),
    )
    if (reservation.tools.some((name) => reserve?.excluded(name)))
      return 'excluded'
    if (declared.some((entry) => !entry)) return 'not_ready'
    const bundle: NativeToolEntry[] = []
    for (const entry of declared as NativeToolEntry[]) {
      // Keep DECISIONS §21.1 "core whole or not at all", and never expose a
      // provider's action tools without its reads.
      const core = entries.filter(
        (item) =>
          item.providerId === entry.providerId &&
          (item.tool.group ?? 'core') === 'core' &&
          !reserve?.excluded(item.name),
      )
      if (core.some((item) => !added.has(item.name))) bundle.push(...core)
      bundle.push(entry)
    }
    return (await add(bundle[0].providerId, bundle, 'reservation'))
      ? 'reserved'
      : 'budget'
  }
  const allocateMinimum = async (
    group: (typeof groups)[number],
    stage: Stage,
  ) => {
    if (await add(group.id, group.minimum, stage, stage === 'explicit'))
      optional.push(
        ...group.optional.map((tools) => ({ providerId: group.id, tools })),
      )
    else
      for (const tools of group.optional) {
        omitted += tools.length
        attempts.push({
          providerId: group.id,
          stage: 'optional',
          tools: tools.map((entry) => entry.name),
          result: 'skipped',
          blockedBy: { providerId: group.id, stage },
        })
      }
  }
  const flushOptional = async (rankByRequest = false) => {
    optional.sort((a, b) => a.providerId.localeCompare(b.providerId, 'en'))
    const score = reserve?.requestScore
    if (rankByRequest && score)
      optional.sort((a, b) => score(b.tools) - score(a.tools))
    for (const group of optional)
      await add(group.providerId, group.tools, 'optional')
    optional.length = 0
  }
  for (const group of groups.filter((item) => item.rank < 2))
    await allocateMinimum(group, 'explicit')
  const automatic = (preferred: boolean) =>
    groups
      .filter((item) => item.rank === 2 && item.preferred === preferred)
      .sort(
        (a, b) =>
          (reserve?.providerRequestScore?.(b.tools) ?? 0) -
            (reserve?.providerRequestScore?.(a.tools) ?? 0) ||
          a.id.localeCompare(b.id, 'en'),
      )
  for (const group of automatic(true)) await allocateMinimum(group, 'core')
  for (const reservation of reserve?.reservations ?? [])
    reservations.push({
      skill: reservation.skill,
      tools: [...reservation.tools],
      result: await reserveSkill(reservation),
    })
  // WP8(b): explicit and current-document providers' optional groups compete
  // by this request's score only; ties keep the per-provider order.
  await flushOptional(true)
  for (const group of automatic(false)) await allocateMinimum(group, 'other')
  await flushOptional()
  return {
    definitions,
    tokens,
    omitted,
    missingExplicit,
    attempts,
    reservations,
  }
}
