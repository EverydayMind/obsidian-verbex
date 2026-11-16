import { DESCRIPTOR_LIMITS, RESULT_LIMITS, copyJson } from './descriptorReader'
import type { InvocationContext } from './protocol'

/** Provider code receives mutable copies; the host retains its bound context. */
export function copyInvocationContext(
  context: InvocationContext,
  signal: AbortSignal,
): InvocationContext {
  return {
    ...context,
    caller: { ...context.caller },
    actor: { ...context.actor },
    providerIdentity: context.providerIdentity
      ? { ...context.providerIdentity }
      : undefined,
    observations: context.observations ? [...context.observations] : undefined,
    scope: context.scope
      ? (copyJson(
          context.scope,
          DESCRIPTOR_LIMITS,
        ) as InvocationContext['scope'])
      : undefined,
    target:
      context.target === undefined
        ? undefined
        : copyJson(context.target, RESULT_LIMITS),
    grant: context.grant ? { ...context.grant } : undefined,
    signal,
  }
}
