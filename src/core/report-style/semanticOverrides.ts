import type { SemanticOverride } from './effectiveStructure'
import type { ProfileV2 } from './profileV2'

export function persistedSemanticOverrides(
  machine: ProfileV2,
): SemanticOverride[] {
  return machine.semantics.map((item) => ({
    ref: item.ref,
    role: item.role,
    ...(item.level === undefined ? {} : { level: item.level }),
    ...(Object.prototype.hasOwnProperty.call(item, 'semanticParentRef')
      ? { parent_ref: item.semanticParentRef }
      : {}),
    assignedBy: item.assignedBy,
  }))
}
