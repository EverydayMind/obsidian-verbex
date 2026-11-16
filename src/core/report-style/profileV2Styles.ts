import { canonicalDigest } from '../../security/promptInjectionBoundary'

import type { ReportStylePorts } from './ports'
import {
  type ProfileV2,
  type RoleStyleVariant,
  styleSources,
  validateExpandedProfileV2,
  validateProfileV2,
} from './profileV2'
import type { FixedRegion } from './types'
import { parseVariantMarker } from './variantMarkers'

export type RoleStyleInput = Omit<
  RoleStyleVariant,
  'assignedBy' | 'legacy' | 'role'
> & { role: string; index?: number }

/** Existing indices are updated in place; omitted index appends a new style. */
export async function setModelRoleStyles(
  machine: ProfileV2,
  input: RoleStyleInput[],
  ports: ReportStylePorts,
  signal?: AbortSignal,
  removeIndices: number[] = [],
  fixedRegions: FixedRegion[] = machine.fixedRegions,
  expanded = false,
): Promise<ProfileV2> {
  if (input.length + removeIndices.length > 128 || !ports.validateMarkers)
    throw new Error(
      'Invalid role styles or Exporter marker catalog unavailable.',
    )
  const styles = [...machine.roleStyleMap],
    seen = new Set<number>()
  for (const item of input) {
    const { index, ...fields } = item
    const named = parseVariantMarker(fields.marker)
    if (
      fields.variant === null
        ? named !== null
        : named?.variant !== fields.variant
    )
      throw new Error('Variant name and supported marker must match.')
    if (
      Object.prototype.hasOwnProperty.call(fields, 'assignedBy') ||
      Object.prototype.hasOwnProperty.call(fields, 'legacy')
    )
      throw new Error('Role style provenance is host-owned.')
    if (index === undefined) styles.push({ ...fields, assignedBy: 'model' })
    else {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= machine.roleStyleMap.length ||
        seen.has(index)
      )
        throw new Error('Invalid role style index.')
      seen.add(index)
      styles[index] = {
        ...fields,
        assignedBy: 'model',
        ...(machine.roleStyleMap[index].legacy
          ? { legacy: machine.roleStyleMap[index].legacy }
          : {}),
      }
    }
  }
  for (const index of removeIndices) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= machine.roleStyleMap.length ||
      seen.has(index)
    )
      throw new Error('Invalid role style removal.')
    seen.add(index)
  }
  for (const index of [...removeIndices].sort((a, b) => b - a))
    styles.splice(index, 1)
  if (signal?.aborted) throw new Error('Report style operation cancelled.')
  await ports.validateMarkers(
    styles.map((style) => style.marker),
    signal,
  )
  if (signal?.aborted) throw new Error('Report style operation cancelled.')
  const unchanged =
    (await canonicalDigest(styleSources(styles))) ===
      (await canonicalDigest(styleSources(machine.roleStyleMap))) &&
    (await canonicalDigest(fixedRegions)) ===
      (await canonicalDigest(machine.fixedRegions))
  return (expanded ? validateExpandedProfileV2 : validateProfileV2)({
    ...machine,
    roleStyleMap: styles,
    fixedRegions,
    template: unchanged ? machine.template : null,
  })
}
