import type { JsonObject } from '../provider/interop/protocol'

export function documentJobContractRoles(contract: JsonObject): JsonObject {
  const roles = contract.roles
  return roles && typeof roles === 'object' && !Array.isArray(roles)
    ? roles
    : {}
}
