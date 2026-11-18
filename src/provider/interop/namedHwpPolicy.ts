import type { ReferencedHwp } from '../../context/documentJobReferences'

export function eligibleNamedHwp(
  reference: ReferencedHwp,
  namedHwp?: string,
): string | undefined {
  return reference === 'none' ||
    (typeof reference === 'object' && reference.source === 'current_file')
    ? namedHwp
    : undefined
}

export function adoptNamedHwp(
  reference: ReferencedHwp,
  candidate: string | undefined,
  intended: boolean,
): ReferencedHwp {
  return candidate && intended
    ? { path: candidate, source: 'explicit' }
    : reference
}
