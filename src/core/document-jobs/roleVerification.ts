import type { JsonObject } from '../../provider/interop/protocol'
import type { SavedAnchorReference } from '../../provider/interop/resolveSavedAnchorRefs'
import type {
  Binding,
  ProfileMachine,
  StyleSnapshot,
} from '../report-style/types'

import { adjudicateRole } from './roleAdjudication'
import type { RoleAnchorPlan } from './roleAnchorPlan'

/** Counts only explicit anchor mappings; missing anchors never become style matches. */
export function verifyMappedRoles(input: {
  profile: ProfileMachine
  output: StyleSnapshot
  plan: RoleAnchorPlan
  references: readonly SavedAnchorReference[]
  droppedBindings: readonly Binding[]
}) {
  const { profile, output, plan, references } = input
  if (
    references.length !== plan.selected.length ||
    references.some((item, index) => item.blockIndex !== plan.selected[index])
  )
    throw new Error('Resolved references do not match the anchor plan.')
  const matched = references.flatMap((item) =>
    item.state === 'matched' ? [item.ref] : [],
  )
  if (new Set(matched).size !== matched.length)
    throw new Error('Duplicate resolved paragraph references.')
  const byIndex = new Map(references.map((item) => [item.blockIndex, item]))
  const active = profile.bindings.filter(
    (binding) => !binding.marker.startsWith('SPACE:'),
  )
  const dropped = input.droppedBindings.filter(
    (binding) => !binding.marker.startsWith('SPACE:'),
  )
  if (active.length + dropped.length > 128)
    throw new Error('Too many roles for a complete report.')
  if (
    new Set([...active, ...dropped].map((binding) => binding.key)).size !==
    active.length + dropped.length
  )
    throw new Error('Duplicate role key.')
  const roles = active.map((binding) => {
    const meta: JsonObject =
      binding.marker === 'BODY' ? { metaWithoutRule: plan.metaWithoutRule } : {}
    const indices = plan.byMarker[binding.marker]
    if (!indices) throw new Error('Missing role anchor plan.')
    if (!indices.length)
      return {
        ...meta,
        key: binding.key,
        marker: binding.marker,
        result: 'unverified' as const,
        reason: 'no_block_with_marker',
      }
    const representative = byIndex.get(indices[0])
    if (!representative || representative.state !== 'matched')
      return {
        ...meta,
        key: binding.key,
        marker: binding.marker,
        result: 'unverified' as const,
        reason: 'anchor_unavailable',
      }
    const primary = adjudicateRole(
      profile,
      output,
      binding.key,
      representative.ref,
    )
    const consistency = {
      total: indices.length,
      checked: 0,
      same: 0,
      different: 0,
      unmeasured: 0,
      differingRefs: [] as string[],
      truncated: false,
    }
    for (const index of indices) {
      const anchor = byIndex.get(index)
      if (!anchor || anchor.state !== 'matched') continue
      const observed = adjudicateRole(profile, output, binding.key, anchor.ref)
      consistency.checked++
      if (observed.result === 'same') consistency.same++
      else if (observed.result === 'different') {
        consistency.different++
        if (consistency.differingRefs.length < 5)
          consistency.differingRefs.push(anchor.ref)
      } else consistency.unmeasured++
    }
    consistency.truncated = consistency.checked < consistency.total
    return {
      ...meta,
      key: binding.key,
      marker: binding.marker,
      ...primary,
      outputRef: representative.ref,
      consistency,
    }
  })
  const droppedRoles = dropped.map((binding) => ({
    key: binding.key,
    marker: binding.marker,
    result: 'dropped' as const,
    reason: 'derivation_role_dropped',
  }))
  const unverified = roles.filter((role) => role.result === 'unverified').length
  return {
    roles: [...roles, ...droppedRoles],
    mapping: {
      total: roles.length + droppedRoles.length,
      mapped: roles.length - unverified,
      dropped: droppedRoles.length,
      unverified,
    },
  }
}
