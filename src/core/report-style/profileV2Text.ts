import {
  type ProfileV2,
  validateExpandedProfileV2,
  validateProfileV2,
} from './profileV2'

type Override = ProfileV2['textProfile']['overrides'][number]
export type TextOverrideInput = Omit<Override, 'assignedBy'>

/** Replace explicit preferences; their provenance is always supplied by the host. */
export async function setModelTextProfile(
  machine: ProfileV2,
  input: TextOverrideInput[],
  expanded = false,
): Promise<ProfileV2> {
  if (!Array.isArray(input) || input.length > 256)
    throw new Error('Invalid text profile overrides.')
  const keys = new Set<string>()
  const overrides = input.map((item) => {
    if (!item || Object.prototype.hasOwnProperty.call(item, 'assignedBy'))
      throw new Error('Text profile provenance is host-owned.')
    const key = JSON.stringify([item.role, item.field])
    if (keys.has(key)) throw new Error('Duplicate text profile field.')
    keys.add(key)
    return { ...item, assignedBy: 'model' as const }
  })
  return (expanded ? validateExpandedProfileV2 : validateProfileV2)({
    ...machine,
    textProfile: { overrides },
  })
}

export async function setStructuralFidelity(
  machine: ProfileV2,
  structural: ProfileV2['fidelity']['structural'],
  expanded = false,
): Promise<ProfileV2> {
  return (expanded ? validateExpandedProfileV2 : validateProfileV2)({
    ...machine,
    fidelity: { structural },
  })
}
